import { Queue } from 'bullmq';
import config from '../config';

// Define the UpgradeGenerationJob type
export interface UpgradeGenerationJob {
  userId: string;
  generationId: string;
  imagePath: string;
  chatId: number;
  messageId: number;
  language: string;
}

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

// Create the upgrade generation queue
const upgradeQueue = redisConfig
  ? new Queue<UpgradeGenerationJob>('upgrade-generation', {
      connection: redisConfig,
      defaultJobOptions: {
        attempts: config.queue.jobRetryAttempts,
        backoff: {
          type: 'exponential',
          delay: config.queue.jobRetryDelay,
        },
        removeOnComplete: config.queue.removeCompletedAfter,
        removeOnFail: config.queue.removeFailedAfter,
      },
    })
  : null;

/**
 * Add a new upgrade generation job to the queue
 * @param data Upgrade generation job data
 * @returns Job ID
 */
export async function addUpgradeGenerationJob(data: UpgradeGenerationJob): Promise<string> {
  if (!upgradeQueue) {
    throw new Error('Upgrade queue not available - Redis connection failed');
  }
  const job = await upgradeQueue.add('enhance-image', data);
  return job.id || '';
}

/**
 * Get the status of an upgrade generation job
 * @param jobId Job ID to check
 * @returns Job status or null if job not found
 */
export async function getUpgradeJobStatus(jobId: string): Promise<string | null> {
  if (!upgradeQueue) {
    return null;
  }
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
