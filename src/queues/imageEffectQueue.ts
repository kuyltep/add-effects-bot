import { Queue, Worker } from 'bullmq';
import config from '../config';
import { EffectType } from '../types';
import { Logger } from '../utils/rollbar.logger';
import { createRedisConnection } from '../utils/redis';

// Define the job data structure for this queue
export interface ImageEffectJobData {
  generationId: string;
  userId: string;
  fileId?: string;
  effect?: EffectType;
  logoEffect?: string;
  bannerEffect?: string;
  roomDesignEffect?: string;
  prompt?: string;
  chatId: string;
  messageId: number;
  language: string;
  resolution?: string;
  apiProvider: API_PROVIDER;
}

const QUEUE_NAME = 'image-effect-generation';

// Create a Redis connection using utility function
const redisConnection = createRedisConnection();

// API providers
export type API_PROVIDER =
  'openai' |
  'fal-ai' |
  'gap';


// Create the BullMQ queue instance
export const imageEffectQueue = new Queue<ImageEffectJobData>(QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: config.queue.jobRetryAttempts, // Use global config
    backoff: {
      type: 'exponential',
      delay: config.queue.jobRetryDelay, // Use global config
    },
    removeOnComplete: { age: config.queue.removeCompletedAfter },
    removeOnFail: { age: config.queue.removeFailedAfter },
  },
});

/**
 * Adds a job to the image effect generation queue.
 *
 * @param data - The job data containing details for the image effect generation.
 * @returns The added job instance.
 */
export async function addImageEffectJob(data: ImageEffectJobData) {
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
  await imageEffectQueue.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await imageEffectQueue.close();
  process.exit(0);
});
