import { Queue } from 'bullmq';
import config from '../config';
import { createRedisConnection } from '../utils/redis';

// Define the UpgradeGenerationJob type
export interface UpgradeGenerationJob {
  userId: string;
  generationId: string;
  imagePath: string;
  chatId: number;
  messageId: number;
  language: string;
}

const redisConnection = createRedisConnection();

// Create the upgrade generation queue
const upgradeQueue = new Queue<UpgradeGenerationJob>('upgrade-generation', {
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
 * Add a new upgrade generation job to the queue
 * @param data Upgrade generation job data
 * @returns Job ID
 */
export async function addUpgradeGenerationJob(data: UpgradeGenerationJob): Promise<string> {
  const job = await upgradeQueue.add('enhance-image', data);
  return job.id || '';
}

/**
 * Get the status of an upgrade generation job
 * @param jobId Job ID to check
 * @returns Job status or null if job not found
 */
export async function getUpgradeJobStatus(jobId: string): Promise<string | null> {
  const job = await upgradeQueue.getJob(jobId);

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

export default upgradeQueue;
