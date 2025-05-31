import { Worker, Job } from 'bullmq';
import { prisma } from '../utils/prisma';
import config from '../config';
import { Logger } from '../utils/rollbar.logger';
import { ImageEffectJobData } from './imageEffectQueue';
import { GenerationStatus, Resolution } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createRedisConnection, createRedisPublisher } from '../utils/redis';
import { applyImageEffect } from '../services/fal-ai';
import { isMainThread, parentPort, workerData } from 'worker_threads';
import { createImageOpenAI, editImageOpenAI } from '../services/openai';
import { generateJointPhoto } from '../services/runway';

// Constants
const QUEUE_NAME = 'image-effect-generation';
const UPLOAD_DIR = config.server.uploadDir;
const SUPPORT_USERNAME = process.env.TELEGRAM_SUPPORT_USERNAME || 'support';

// Group effects by processing service
const OPENAI_EFFECTS = [
  'claymation',
  'ghibli',
  'pixar',
  'bratz',
  'cat',
  'dog',
  'sticker',
  'new_disney',
  'old_disney',
  'mitchells',
  'dreamworks',
];
const FAL_AI_EFFECTS = ['plushify', 'ghiblify', 'cartoonify'];

// Initialize resources
let redisConnection;
let redisPublisher;

function initializeRedisConnections() {
  if (!redisConnection) {
    redisConnection = createRedisConnection();
  }
  if (!redisPublisher) {
    redisPublisher = createRedisPublisher();
  }
}

// i18n translations for effect worker
const translations = {
  en: {
    processing: '🔄 Processing image...',
    applying_effect: '🎨 Applying {{effect}} effect...',
    openai_processing: '✨ Adding final touches with AI...',
    effect_applied: "✅ Effect '{{effect}}' applied!",
    error_applying:
      "❌ Error applying effect '{{effect}}'. Please try again or contact @{{supportUsername}}.",
  },
  ru: {
    processing: '🔄 Обработка изображения...',
    applying_effect: '🎨 Применение эффекта {{effect}}...',
    openai_processing: '✨ Добавление финальных штрихов с ИИ...',
    effect_applied: "✅ Эффект '{{effect}}' применен!",
    error_applying:
      "❌ Ошибка при применении эффекта '{{effect}}'. Пожалуйста, попробуйте еще раз или свяжитесь с @{{supportUsername}}.",
  },
};

// Get localized message
function getMessage(key: string, language: string, params: Record<string, any> = {}): string {
  const lang = language === 'ru' ? 'ru' : 'en';
  const message = translations[lang][key];

  if (!message) return key;

  return Object.entries(params).reduce(
    (result, [param, value]) => result.replace(`{{${param}}}`, value),
    message
  );
}

/**
 * Downloads a file from Telegram using the bot core via Redis.
 * @param fileId - The Telegram file ID.
 * @returns The local path where the file was downloaded.
 */
async function downloadTelegramFile(fileId: string): Promise<string> {
  // Create a unique filename for the download
  const tempDir = path.join(UPLOAD_DIR, 'temp');
  await fs.mkdir(tempDir, { recursive: true });
  const filePath = path.join(tempDir, `${uuidv4()}-${fileId}.jpg`);

  // Ensure Redis connections are initialized
  initializeRedisConnections();

  // Request the bot to download the file via Redis
  await redisPublisher.publish(
    'bot:download_file',
    JSON.stringify({
      fileId,
      downloadPath: filePath,
    })
  );

  // Wait for the file to be downloaded
  const maxWaitTime = 25000; // 25 seconds
  const checkInterval = 3000; // 3 seconds
  let waitedTime = 0;

  while (waitedTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    waitedTime += checkInterval;

    try {
      const stats = await fs.stat(filePath);
      if (stats.size > 0) {
        return filePath;
      }
    } catch (error) {
      // File doesn't exist yet or error checking, continue waiting
    }
  }

  throw new Error(`Timed out after ${maxWaitTime}ms waiting for file download`);
}

/**
 * Downloads multiple files from Telegram using the bot core via Redis.
 * @param fileIds - Array of Telegram file IDs.
 * @returns Array of local paths where the files were downloaded.
 */
async function downloadMultipleTelegramFiles(fileIds: string[]): Promise<string[]> {
  return Promise.all(fileIds.map(fileId => downloadTelegramFile(fileId)));
}

/**
 * Processes an image effect generation job.
 */
async function processImageEffectJob(job: Job<ImageEffectJobData>): Promise<void> {
  const {
    generationId,
    userId,
    fileIds,
    effect,
    chatId,
    messageId,
    language,
    resolution = 'SQUARE',
    logoEffect,
    bannerEffect,
    roomDesignEffect,
    jointPhotoEffect,
    effectObject,
    prompt,
    apiProvider,
  } = job.data;

  let localFilePath: string | null = null;
  let localFilePaths: string[] = null;
  let finalOutputPath: string | null = null;

  try {
    // Ensure Redis connections are initialized
    initializeRedisConnections();

    // 1. Update status to PROCESSING
    await prisma.generation.update({
      where: { id: generationId },
      data: { status: GenerationStatus.PROCESSING },
    });

    await redisPublisher.publish(
      'bot:status_update',
      JSON.stringify({
        chatId,
        messageId,
        text: getMessage('processing', language),
      })
    );

    // 2. Download the original images from Telegram via bot core or create
    if (fileIds) {
      localFilePaths = await downloadMultipleTelegramFiles(fileIds);
    } else {
      localFilePath = path.join(UPLOAD_DIR, 'temp');
    }

    if (localFilePaths && localFilePaths.length === 1) {
      localFilePath = localFilePaths[0];
    }

    // 3. Apply effect based on type
    await redisPublisher.publish(
      'bot:status_update',
      JSON.stringify({
        chatId,
        messageId,
        text: getMessage('applying_effect', language, {
          effect: effect || logoEffect || bannerEffect || roomDesignEffect || jointPhotoEffect,
        }),
      })
    );

    // Generate image with OpenAI service
    if (!fileIds) {
      finalOutputPath = await createImageOpenAI(
        localFilePath,
        effect,
        resolution as Resolution,
        logoEffect,
        bannerEffect,
        roomDesignEffect,
        prompt
      );
    } else if (FAL_AI_EFFECTS.includes(effect)) {
      // Process with FAL AI
      finalOutputPath = await applyImageEffect(localFilePath, effect, resolution as Resolution);
    } else if (OPENAI_EFFECTS.includes(effect) && apiProvider === 'openai') {
      // Pass the resolution to OpenAI service
      finalOutputPath = await editImageOpenAI(
        localFilePath,
        effect,
        resolution as Resolution,
        job.data.logoEffect
      );
    } else if (
      job.data.logoEffect ||
      job.data.bannerEffect ||
      job.data.roomDesignEffect ||
      job.data.jointPhotoEffect
    ) {
      const effect =
        job.data.logoEffect ||
        job.data.bannerEffect ||
        job.data.roomDesignEffect ||
        job.data.jointPhotoEffect;

      if (apiProvider === 'openai') {
        finalOutputPath = await editImageOpenAI(
          localFilePath,
          effect,
          resolution as Resolution,
          job.data.logoEffect,
          job.data.bannerEffect,
          job.data.roomDesignEffect,
          job.data.jointPhotoEffect,
          job.data.effectObject,
          prompt
        );
      } else if (apiProvider === 'runway') {
        finalOutputPath = await generateJointPhoto(
          localFilePaths,
          prompt,
          resolution as Resolution
        );
      }
    } else {
      throw new Error(`Unsupported effect type: ${effect}`);
    }

    // 4. Save the final image to the user's directory
    const outputDir = path.join(UPLOAD_DIR, userId, generationId);
    await fs.mkdir(outputDir, { recursive: true });

    // 5. Copy the final image to the user's directory if needed
    if (finalOutputPath !== path.join(outputDir, 'final_effect_image.jpg')) {
      const userFilePath = path.join(outputDir, 'final_effect_image.jpg');
      const fileContent = await fs.readFile(finalOutputPath);
      await fs.writeFile(userFilePath, fileContent);
      finalOutputPath = userFilePath;
    }

    // 6. Decrement user generations (atomic operation)
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { remainingGenerations: { decrement: 1 } },
    });

    // 7. Update Generation record to COMPLETED
    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: GenerationStatus.COMPLETED,
        imageUrls: [finalOutputPath],
      },
    });

    // 8. Notify user via Redis with the effect results
    await redisPublisher.publish(
      'bot:send_effect',
      JSON.stringify({
        chatId,
        imageData: {
          path: finalOutputPath,
          isUrl: false,
        },
        userId,
        referralCode: updatedUser?.referralCode || '',
        language,
        generationId,
        effect,
      })
    );
  } catch (error) {
    Logger.error(`Job ${job.id} failed for generation ${generationId}`, { error, effect, userId });

    // Update status to FAILED
    await prisma.generation
      .update({
        where: { id: generationId },
        data: { status: GenerationStatus.FAILED, error: error.message },
      })
      .catch(updateErr =>
        Logger.error('Failed to update generation status to FAILED', { updateErr })
      );

    // Ensure Redis connections are initialized
    initializeRedisConnections();

    // Notify user of failure via Redis
    await redisPublisher
      .publish(
        'bot:status_update',
        JSON.stringify({
          chatId,
          messageId,
          text: getMessage('error_applying', language, {
            effect,
            supportUsername: SUPPORT_USERNAME,
          }),
        })
      )
      .catch(pubErr => Logger.error('Failed to publish error status update', { pubErr }));

    // Re-throw the error so BullMQ marks the job as failed
    throw error;
  } finally {
    try {
      // Clean up temporary downloaded file
      if (localFilePath && fileIds) {
        await fs
          .unlink(localFilePath)
          .catch(unlinkErr =>
            Logger.warn(`Failed to delete temp file ${localFilePath}`, { unlinkErr })
          );
      }
    } catch (cleanupError) {
      Logger.warn('Error during cleanup', { cleanupError });
    }
  }
}

let worker;

// Create the worker
function createWorker() {
  // Initialize Redis connections
  initializeRedisConnections();

  return new Worker<ImageEffectJobData>(QUEUE_NAME, processImageEffectJob, {
    connection: redisConnection,
    concurrency: parseInt(process.env.EFFECT_WORKER_CONCURRENCY || '3', 10),
    limiter: {
      max: 10,
      duration: 1000,
    },
  });
}

// Create and initialize worker
worker = createWorker();

worker.on('failed', (job: Job<ImageEffectJobData>, err: Error) => {
  Logger.error(`Job ${job.id} failed for generation ${job.data.generationId}`, {
    error: err,
    attemptsMade: job.attemptsMade,
  });
});

worker.on('error', err => {
  Logger.error('BullMQ Worker Error', { error: err });
});

// Graceful shutdown handler
const gracefulShutdown = async () => {
  try {
    if (worker) {
      await worker.close();
    }

    if (redisPublisher) {
      await redisPublisher.quit();
      redisPublisher = null;
    }

    if (redisConnection) {
      await redisConnection.quit();
      redisConnection = null;
    }

    // If running in a worker thread, notify the parent
    if (!isMainThread && parentPort) {
      parentPort.postMessage({ type: 'shutdown', success: true });
    }
  } catch (error) {
    Logger.error('Error during worker shutdown:', error);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// If running in a worker thread, notify parent when ready
if (!isMainThread && parentPort) {
  parentPort.postMessage({ type: 'ready', worker: workerData?.workerName || 'imageEffectWorker' });

  // Listen for messages from the parent thread
  parentPort.on('message', message => {
    if (message.type === 'shutdown') {
      gracefulShutdown();
    }
  });
}

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', error => {
  Logger.error('Uncaught exception in imageEffectWorker:', error);
  gracefulShutdown().catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled rejection in imageEffectWorker:', { reason, promise });
  gracefulShutdown().catch(() => process.exit(1));
});

export default worker;
