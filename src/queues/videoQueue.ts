import { Queue } from 'bullmq';
import config from '../config';
import { createRedisConnection } from '../utils/redis';

// Define the VideoGenerationJob type
export interface VideoGenerationJob {
  userId: string;
  generationId: string;
  imagePath?: string;
  fileId?: string;
  prompt: string;
  translatedPrompt: string | null;
  isTranslated: boolean;
  chatId: number;
  messageId: number;
  language: string;
  effect: string;
  source?: string; // Track where the video generation was initiated from
}

const redisConnection = createRedisConnection();

// Create the video generation queue
const videoQueue = new Queue<VideoGenerationJob>('video-generation', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: config.queue.jobRetryAttempts,
    backoff: {
      type: 'exponential',
      delay: config.queue.jobRetryDelay,
    },
    removeOnComplete: config.queue.removeCompletedAfter,
    removeOnFail: config.queue.removeFailedAfter,
  },
});

/**
 * Add a new video generation job to the queue
 * @param data Video generation job data
 * @returns Job ID
 */
export async function addVideoGenerationJob(data: VideoGenerationJob): Promise<string> {
  const job = await videoQueue.add('generate-video', data);
  return job.id || '';
}

/**
 * Get the status of a video generation job
 * @param jobId Job ID to check
 * @returns Job status or null if job not found
 */
export async function getVideoJobStatus(jobId: string): Promise<string | null> {
  const job = await videoQueue.getJob(jobId);

  if (!job) {
    return null;
  }

  // Check job state
  const state = await job.getState();

  // If completed, check if there was a result
  if (state === 'completed') {
    return state;
  }

  // If failed, include error information
  if (state === 'failed') {
    const failedReason = job.failedReason;
    return `failed: ${failedReason}`;
  }

  return state;
}

export default videoQueue; 