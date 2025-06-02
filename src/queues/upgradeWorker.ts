import { Worker, Job } from 'bullmq';
import { UpgradeGenerationJob } from './upgradeQueue';
import { GenerationStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { createRedisPublisher } from '../utils/redis';
import fs from 'fs';
import path from 'path';
import { enhanceImage } from '../services/replicate';
import i18next from '../i18n';
import fetch from 'node-fetch';
import { isMainThread, parentPort, workerData } from 'worker_threads';
import config from '../config';

// Initialize Redis connection with Railway-specific settings
const redisConfig = config.redis.url
  ? (() => {
      const redisURL = new URL(config.redis.url);
      const redisConfig: any = {
        host: redisURL.hostname,
        port: parseInt(redisURL.port) || 6379,
        maxRetriesPerRequest: null, // BullMQ требует null
        lazyConnect: true,
      };

      // Добавляем username/password только если они есть (для локальной разработки могут отсутствовать)
      if (redisURL.username) {
        redisConfig.username = redisURL.username;
      }
      if (redisURL.password) {
        redisConfig.password = redisURL.password;
      }

      // Railway требует dual stack lookup только для внутренних соединений
      if (
        redisURL.hostname.includes('railway.internal') ||
        redisURL.hostname.includes('rlwy.net')
      ) {
        redisConfig.family = 0;
      }

      return redisConfig;
    })()
  : undefined;

// Debug Redis configuration
if (redisConfig) {
  console.log('🔧 Redis config for upgradeWorker:', {
    host: redisConfig.host,
    port: redisConfig.port,
    hasUsername: !!redisConfig.username,
    hasPassword: !!redisConfig.password,
    family: redisConfig.family,
    maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
    lazyConnect: redisConfig.lazyConnect,
  });
} else {
  console.log('⚠️  No Redis config for upgradeWorker');
}

// Create Redis publisher for sending messages to bot
const redisPublisher = createRedisPublisher();

// Define result type
interface UpgradeResult {
  status: 'completed' | 'failed';
  imageUrl?: string;
  error?: string;
}

const IMAGE_UPGRADE_COST = +process.env.IMAGE_UPGRADE_COST;

// Create and configure the worker
function createWorker() {
  if (!redisConfig) {
    throw new Error('Redis not configured - cannot create upgrade worker');
  }

  return new Worker<UpgradeGenerationJob, UpgradeResult>('upgrade-generation', processUpgradeJob, {
    connection: redisConfig,
    concurrency: parseInt(process.env.UPGRADE_WORKER_CONCURRENCY || '1', 10),
    stalledInterval: 10000, // Check for stalled jobs every 30 seconds
    lockDuration: 300000, // Lock jobs for 5 minutes
  });
}

// Process an upgrade generation job
async function processUpgradeJob(job: Job<UpgradeGenerationJob>): Promise<UpgradeResult> {
  console.info(`Upgrade worker processing job ${job.id}`);

  try {
    // Extract job data
    const jobData = job.data;

    const { userId, generationId, imagePath, chatId, messageId, language } = jobData;

    // Validate data
    if (!imagePath.startsWith('http') && !fs.existsSync(imagePath)) {
      throw new Error('Image file not found');
    }

    // Update the user that image enhancement has started
    await sendStatusUpdate(jobData, 'enhancing');

    try {
      // Enhance the image - returns URL
      const enhancedImageUrl = await enhanceImage(imagePath);

      // Save enhanced image locally with standard name
      const timestampFolder = Date.now().toString();
      const localEnhancedPath = await saveImageLocally(
        enhancedImageUrl,
        timestampFolder,
        'great-photo.png'
      );

      // Update the generation record with both URLs
      await prisma.generation.update({
        where: { id: generationId },
        data: {
          status: GenerationStatus.COMPLETED,
          imageUrls: [localEnhancedPath],
        },
      });

      // Get user's remaining generations
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          remainingGenerations: {
            decrement: IMAGE_UPGRADE_COST,
          },
        },
        select: { remainingGenerations: true },
      });

      // Send enhanced image to user (using local path)
      await sendEnhancedImage(jobData, localEnhancedPath, user.remainingGenerations);

      // Return success with both paths
      return {
        status: 'completed',
        imageUrl: localEnhancedPath,
      };
    } catch (enhanceError) {
      console.error('Error during image enhancement:', enhanceError);
      throw new Error(`Image upgrade failed: ${enhanceError.message}`);
    }
  } catch (error) {
    // Handle errors and notify user
    await handleUpgradeError(job, error);

    // Return error result
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Send status update to user
async function sendStatusUpdate(jobData: UpgradeGenerationJob, status: string) {
  const { chatId, messageId, language } = jobData;

  if (!chatId || !messageId) return;

  try {
    let translationKey: string;

    switch (status) {
      case 'enhancing':
        translationKey = 'bot:upgrade.enhancing';
        break;
      case 'completed':
        translationKey = 'bot:upgrade.completed';
        break;
      default:
        translationKey = 'bot:upgrade.processing';
    }

    const text = i18next.t(translationKey, { lng: language });

    await redisPublisher.publish(
      'bot:status_update',
      JSON.stringify({
        chatId,
        messageId,
        text,
        parseMode: 'HTML',
      })
    );
  } catch (error) {
    console.error('Error sending status update:', error);
  }
}

// Send enhanced image to user
async function sendEnhancedImage(
  jobData: UpgradeGenerationJob,
  imageUrl: string,
  remainingGenerations: number
) {
  const { chatId, messageId, language } = jobData;

  if (!chatId) return;

  try {
    // Delete the status message
    await redisPublisher.publish(
      'bot:delete_message',
      JSON.stringify({
        chatId,
        messageId,
      })
    );

    // Create localized caption
    const caption =
      language === 'ru'
        ? `Фото успешно улучшено 💎\nУ вас осталось ${remainingGenerations} генераций\n\nТы можешь продолжить творчество 😊`
        : `Photo successfully enhanced 💎\nYou have ${remainingGenerations} generations left\n\nYou can continue creating 😊`;

    // Send enhanced image as document to preserve quality
    await redisPublisher.publish(
      'bot:send_document',
      JSON.stringify({
        chatId,
        documentUrl: imageUrl,
        caption,
      })
    );

    console.log(`Enhanced image sent to chat ${chatId}`);
  } catch (error) {
    console.error('Error sending enhanced image:', error);
  }
}

// Handle errors
async function handleUpgradeError(job: Job<UpgradeGenerationJob>, error: any) {
  const { userId, generationId, chatId, messageId, language } = job.data;

  console.error(`Error in upgrade job ${job.id}:`, error);

  try {
    // Update generation status
    if (generationId) {
      await prisma.generation.update({
        where: { id: generationId },
        data: {
          status: GenerationStatus.FAILED,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }

    // Refund the user
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          remainingGenerations: {
            increment: IMAGE_UPGRADE_COST, // IMAGE_UPGRADE_COST
          },
        },
      });
    }

    // Notify the user
    if (chatId && messageId) {
      const errorMessage = i18next.t('bot:generate.error', {
        lng: language,
        supportUsername: process.env.TELEGRAM_SUPPORT_USERNAME || 'avato_memory_help_bot',
      });

      await redisPublisher.publish(
        'bot:status_update',
        JSON.stringify({
          chatId,
          messageId,
          text: errorMessage,
          parseMode: 'HTML',
        })
      );
    }
  } catch (updateError) {
    console.error('Error handling upgrade error:', updateError);
  }
}

// Set up worker event handlers
function setupWorkerEvents(worker: Worker) {
  worker.on('completed', (job: Job, result: UpgradeResult) => {
    console.info(`Upgrade job ${job.id} completed with status: ${result.status}`);
  });

  worker.on('failed', (job: Job | undefined, error: Error) => {
    console.error(`Upgrade job ${job?.id || 'unknown'} failed: ${error.message}`);
  });

  worker.on('error', (error: Error) => {
    console.error(`Upgrade worker error: ${error.message}`);
  });
}

// Graceful shutdown handler
const gracefulShutdown = async () => {
  console.info('Shutting down upgrade worker...');
  if (worker) {
    await worker.close();
  }
  if (redisPublisher) {
    await redisPublisher.quit();
  }
  console.info('Upgrade worker shut down successfully');

  // If running in a worker thread, notify the parent that we're shutting down
  if (!isMainThread && parentPort) {
    parentPort.postMessage({ type: 'shutdown', success: true });
  }
};

// Register shutdown handlers
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Create and initialize worker
let worker: Worker<UpgradeGenerationJob, UpgradeResult> | null = null;

if (redisConfig) {
  worker = createWorker();

  // Set up worker events
  setupWorkerEvents(worker);

  console.log('✅ Upgrade worker initialized');

  // If running in a worker thread, notify the parent that we're ready
  if (!isMainThread && parentPort) {
    parentPort.postMessage({ type: 'ready', worker: workerData?.workerName || 'upgradeWorker' });

    // Listen for messages from the parent thread
    parentPort.on('message', message => {
      if (message.type === 'shutdown') {
        gracefulShutdown().catch(error => {
          console.error('Error during worker shutdown:', error);
          process.exit(1);
        });
      }
    });
  }
} else {
  console.log('⚠️  Upgrade worker not initialized - Redis not available');

  // If running in a worker thread, notify parent of failure
  if (!isMainThread && parentPort) {
    parentPort.postMessage({ type: 'error', error: 'Redis not available' });
  }
}

// Export the worker
export default worker;

// Add the saveImageLocally utility function as above
async function saveImageLocally(
  imageUrl: string,
  folderName: string,
  fileName: string
): Promise<string> {
  try {
    // Create directory if it doesn't exist
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    const targetDir = path.join(uploadDir, folderName);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = path.join(targetDir, fileName);

    // Handle both URL and local file
    if (imageUrl.startsWith('http')) {
      // Download from URL
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(targetPath, buffer);
    } else if (fs.existsSync(imageUrl)) {
      // Copy local file
      fs.copyFileSync(imageUrl, targetPath);
    } else {
      throw new Error(`Source image not found: ${imageUrl}`);
    }

    return targetPath;
  } catch (error) {
    throw error;
  }
}
