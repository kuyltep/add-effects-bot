import { Worker, Job } from 'bullmq';
import { VideoGenerationJob } from './videoQueue';
import { GenerationStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { createRedisConnection, createRedisPublisher } from '../utils/redis';
import fs from 'fs';
import { generateVideoFromImage } from '../services/replicate';
import i18next from '../i18n';
import { isMainThread, parentPort, workerData } from 'worker_threads';
import path from 'path';

// Initialize resources
const redisConnection = createRedisConnection();
const redisPublisher = createRedisPublisher();

// Define result type
interface VideoResult {
  status: 'completed' | 'queued' | 'failed';
  predictionId?: string;
  error?: string;
}

const VIDEO_GENERATION_COST = +process.env.VIDEO_GENERATION_COST;

// Create and configure the worker
function createWorker() {
  return new Worker<VideoGenerationJob, VideoResult>('video-generation', processVideoJob, {
    connection: redisConnection,
    concurrency: parseInt(process.env.VIDEO_WORKER_CONCURRENCY || '1', 10),
    stalledInterval: 10000, // Check for stalled jobs every 30 seconds
    lockDuration: 300000, // Lock jobs for 5 minutes
  });
}

// Process a video generation job
async function processVideoJob(job: Job<VideoGenerationJob>): Promise<VideoResult> {
  console.info(`Video worker processing job ${job.id}`);

  try {
    // Extract job data
    const jobData = job.data;

    const {
      userId,
      generationId,
      imagePath,
      fileId,
      prompt,
      translatedPrompt,
      isTranslated,
      chatId,
      messageId,
      language,
      effect,
      source,
    } = jobData;

    // Determine the image path - if fileId is provided, we need to download it first
    let finalImagePath = imagePath;

    if (fileId) {
      try {
        // Download the file from Telegram
        await sendStatusUpdate(jobData, 'downloading');

        // Create a temporary path for the downloaded file
        const tempDir = path.join(process.env.UPLOAD_DIR || 'uploads', userId);
        await fs.promises.mkdir(tempDir, { recursive: true });
        const downloadPath = path.join(tempDir, `${generationId}.jpg`);

        // Request the bot to download the file
        await redisPublisher.publish(
          'bot:download_file',
          JSON.stringify({
            fileId,
            downloadPath,
          })
        );

        // Wait for file to be downloaded (simple polling with timeout)
        const maxWait = 30000; // 30 seconds
        const interval = 1000; // 1 second
        let waited = 0;

        while (waited < maxWait) {
          await new Promise(resolve => setTimeout(resolve, interval));
          waited += interval;

          if (fs.existsSync(downloadPath) && fs.statSync(downloadPath).size > 0) {
            finalImagePath = downloadPath;
            break;
          }
        }

        if (!finalImagePath) {
          throw new Error('Failed to download file from Telegram');
        }
      } catch (downloadError) {
        console.error('Error downloading file from Telegram:', downloadError);
        throw new Error(`Failed to download image: ${downloadError.message}`);
      }
    }

    // Validate data
    if (!finalImagePath || (!finalImagePath.startsWith('http') && !fs.existsSync(finalImagePath))) {
      throw new Error('Image file not found');
    }

    // Update the user that processing has started
    await sendStatusUpdate(jobData, 'processing');

    try {
      // Determine if we need to enhance the image based on effect type
      // FAL AI effects don't need enhancement - they work directly with the image

      let processedImagePath = finalImagePath;

      // Only enhance image for non-FAL effects

      // Start video generation with webhook - returns prediction ID
      const predictionId = await generateVideoFromImage(
        processedImagePath,
        translatedPrompt || prompt,
        generationId,
        chatId,
        userId,
        messageId,
        language,
        effect,
        source
      );

      // Deduct generations from user's balance
      await prisma.user.update({
        where: { id: userId },
        data: {
          remainingGenerations: {
            decrement: VIDEO_GENERATION_COST,
          },
        },
      });

      // Update the generation record with the prediction ID
      await prisma.generation.update({
        where: { id: generationId },
        data: {
          status: GenerationStatus.PROCESSING,
          error: `PROCESSING:${predictionId}`, // Store prediction ID in error field temporarily
        },
      });

      // Return success result - status is 'queued' because the webhook will handle completion
      return {
        status: 'queued',
        predictionId,
      };
    } catch (enhanceError) {
      console.error('Error during image processing or video generation:', enhanceError);
      throw new Error(`Video processing failed: ${enhanceError.message}`);
    }
  } catch (error) {
    // Handle errors and notify user
    await handleVideoError(job, error);

    // Return error result
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Send status update to user
async function sendStatusUpdate(jobData: VideoGenerationJob, status: string) {
  const { chatId, messageId, language } = jobData;

  if (!chatId || !messageId) return;

  try {
    let translationKey: string;

    switch (status) {
      case 'enhancing':
        translationKey = 'bot:video.enhancing';
        break;
      case 'enhancement_complete':
        translationKey = 'bot:video.enhancement_complete';
        break;
      case 'processing':
        translationKey = 'bot:video.processing';
        break;
      case 'completed':
        translationKey = 'bot:video.completed';
        break;
      default:
        translationKey = 'bot:video.processing';
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

// Handle errors
async function handleVideoError(job: Job<VideoGenerationJob>, error: any) {
  const { userId, generationId, chatId, messageId, language } = job.data;

  console.error(`Error in video job ${job.id}:`, error);

  try {
    // Update generation status
    if (generationId) {
      await prisma.generation.update({
        where: { id: generationId },
        data: {
          status: GenerationStatus.FAILED,
        },
      });
    }

    // Refund the user
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          remainingGenerations: {
            increment: parseInt(process.env.VIDEO_GENERATION_COST || '10', 10), // VIDEO_GENERATION_COST
          },
        },
      });
    }

    // Notify the user
    if (chatId && messageId) {
      // Check if error is related to enhancement
      const isEnhancementError = error.message && error.message.includes('enhancement');

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
    console.error('Error handling video error:', updateError);
  }
}

// Set up worker event handlers
function setupWorkerEvents(worker: Worker) {
  worker.on('completed', (job: Job, result: VideoResult) => {
    console.info(`Video job ${job.id} completed with status: ${result.status}`);
  });

  worker.on('failed', (job: Job | undefined, error: Error) => {
    console.error(`Video job ${job?.id || 'unknown'} failed: ${error.message}`);
  });

  worker.on('error', (error: Error) => {
    console.error(`Video worker error: ${error.message}`);
  });
}

// Graceful shutdown handler
const gracefulShutdown = async () => {
  console.info('Shutting down video worker...');
  await worker.close();
  await redisPublisher.quit();
  await redisConnection.quit();
  console.info('Video worker shut down successfully');

  // If running in a worker thread, notify the parent that we're shutting down
  if (!isMainThread && parentPort) {
    parentPort.postMessage({ type: 'shutdown', success: true });
  }
};

// Register shutdown handlers
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Create and initialize worker
const worker = createWorker();

// Set up worker events
setupWorkerEvents(worker);

// If running in a worker thread, notify the parent that we're ready
if (!isMainThread && parentPort) {
  parentPort.postMessage({ type: 'ready', worker: workerData?.workerName || 'videoWorker' });

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

// Export the worker
export default worker;
