import { Queue } from 'bullmq';
import { RestorationJob } from '../types/generation';
import config from '../config';
import { createRedisConnection } from '../utils/redis';

const redisConnection = createRedisConnection();
// Create the restoration queue
const restorationQueue = new Queue<RestorationJob>('photo-restoration', {
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
 * Add a new restoration job to the queue
 * @param data Restoration job data
 * @returns Job ID
 */
export async function addRestorationJob(data: RestorationJob): Promise<string> {
  const job = await restorationQueue.add('restore', data);
  return job.id || '';
}

/**
 * Get the status of a restoration job
 * @param jobId Job ID to check
 * @returns Job status or null if job not found
 */
export async function getRestorationJobStatus(jobId: string): Promise<string | null> {
  const job = await restorationQueue.getJob(jobId);

  if (!job) {
    return null;
  }

  // Check job state
  const state = await job.getState();

  // If completed, check if there was a result
  if (state === 'completed') {
    const result = await (job as any).finished();
    return result?.status || 'completed';
  }

  // If failed, you may want to include error information
  if (state === 'failed') {
    const failedReason = job.failedReason;
    return `failed: ${failedReason}`;
  }

  return state;
}

export default restorationQueue;
