import { Queue, Worker } from 'bullmq';
import config from '../config';
import { EffectType } from '../types';
import { Logger } from '../utils/rollbar.logger';

// Define the job data structure for this queue
export interface ImageEffectJobData {
  generationId: string;
  userId: string;
  fileIds?: string[];
  effect?: EffectType;
  logoEffect?: string;
  bannerEffect?: string;
  roomDesignEffect?: string;
  jointPhotoEffect?: string;
  effectObject?: string; // Type of object; logo, banner erc
  prompt?: string;
  chatId: string;
  messageId: number;
  language: string;
  resolution?: string;
  apiProvider: API_PROVIDER;
}

const QUEUE_NAME = 'image-effect-generation';

// API providers
export type API_PROVIDER = 'openai' | 'fal-ai' | 'runway' | 'gap';

// Create Redis connection for BullMQ with Railway-specific settings
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
  console.log('🔧 Redis config for imageEffectQueue:', {
    host: redisConfig.host,
    port: redisConfig.port,
    hasUsername: !!redisConfig.username,
    hasPassword: !!redisConfig.password,
    family: redisConfig.family,
    maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
    lazyConnect: redisConfig.lazyConnect,
  });
} else {
  console.log('⚠️  No Redis config for imageEffectQueue');
}

// Create the BullMQ queue instance
export const imageEffectQueue = redisConfig
  ? new Queue<ImageEffectJobData>(QUEUE_NAME, {
      connection: redisConfig,
      defaultJobOptions: {
        attempts: config.queue.jobRetryAttempts, // Use global config
        backoff: {
          type: 'exponential',
          delay: config.queue.jobRetryDelay, // Use global config
        },
        removeOnComplete: { age: config.queue.removeCompletedAfter },
        removeOnFail: { age: config.queue.removeFailedAfter },
      },
    })
  : null;

// Log queue creation status
if (imageEffectQueue) {
  console.log('✅ Image effect queue created successfully');
} else {
  console.log('⚠️  Image effect queue not created - Redis not available');
}

/**
 * Adds a job to the image effect generation queue.
 *
 * @param data - The job data containing details for the image effect generation.
 * @returns The added job instance.
 */
export async function addImageEffectJob(data: ImageEffectJobData) {
  if (!imageEffectQueue) {
    throw new Error('Image effect queue not available - Redis connection failed');
  }

  try {
    const job = await imageEffectQueue.add(`generate-${data.effect}-${data.generationId}`, data);
    return job;
  } catch (error) {
    Logger.error(`Error adding job to ${QUEUE_NAME} queue`, { error, data });
    throw error; // Re-throw error to be handled by the caller
  }
}

// Function to initialize and return the worker (will be called in workers/index.ts)
export function createImageEffectWorker(): Worker<ImageEffectJobData> {
  // Worker processing logic will be defined in imageEffectWorker.ts
  Logger.info(`Worker setup for ${QUEUE_NAME} should be initialized in workers/index.ts`);
  return null; // Placeholder
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  if (imageEffectQueue) {
    await imageEffectQueue.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (imageEffectQueue) {
    await imageEffectQueue.close();
  }
  process.exit(0);
});
