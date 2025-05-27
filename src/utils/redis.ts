import { Redis, RedisOptions } from 'ioredis';
import config from '../config';
import { Logger } from './rollbar.logger';

// Redis connection details
const redisUrl = config.redis.url;
if (!redisUrl) {
  Logger.error(
    'Критическая ошибка: Переменная окружения REDIS_URL или значение по умолчанию в config.redis.url не установлено!'
  );
}

// Connection options
const connectionOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  family: 6,
  connectTimeout: 10000,
  retryStrategy: (times: number) => {
    return Math.min(times * 50, 2000);
  },
};

/**
 * Creates and returns a general Redis connection.
 * Caller is responsible for handling errors and closing the connection.
 */
export function createRedisConnection(): Redis {
  if (!redisUrl) throw new Error('Redis URL не найден');

  const connection = new Redis(redisUrl, connectionOptions);
  connection.on('error', err => Logger.error(err, { context: 'Redis Connection' }));

  return connection;
}

/**
 * Creates a Redis subscriber.
 * For long-lived subscriptions, caller must handle errors and closing.
 */
export function createRedisSubscriber(): Redis {
  if (!redisUrl) throw new Error('Redis URL не найден');

  const subscriber = new Redis(redisUrl, connectionOptions);
  subscriber.on('error', err => Logger.error(err, { context: 'Redis Subscriber' }));

  return subscriber;
}

/**
 * Creates a Redis publisher.
 * For one-off publishing, use publishMessage instead to handle connection lifecycle.
 */
export function createRedisPublisher(): Redis {
  if (!redisUrl) throw new Error('Redis URL не найден');

  const publisher = new Redis(redisUrl, connectionOptions);
  publisher.on('error', err => Logger.error(err, { context: 'Redis Publisher' }));

  return publisher;
}

/**
 * Publishes a message to a channel and safely closes the connection.
 * Recommended for one-off message publishing.
 */
export async function publishMessage(channel: string, message: string): Promise<number> {
  const publisher = createRedisPublisher();
  try {
    const result = await publisher.publish(channel, message);
    return result;
  } finally {
    await publisher.quit().catch(err => Logger.error(err, { context: 'Redis Publisher Quit' }));
  }
}

/**
 * Publishes multiple messages in sequence and safely closes the connection.
 * More efficient than calling publishMessage multiple times.
 */
export async function publishBatch(
  messages: Array<{ channel: string; message: string }>
): Promise<void> {
  if (messages.length === 0) return;

  const publisher = createRedisPublisher();
  try {
    for (const { channel, message } of messages) {
      await publisher.publish(channel, message);
    }
  } finally {
    await publisher
      .quit()
      .catch(err => Logger.error(err, { context: 'Redis Publisher Batch Quit' }));
  }
}

// Handle shutdown
process.on('beforeExit', async () => {
  if (redisUrl) {
    const connection = createRedisConnection();
    await connection.quit();
    console.log('Redis connection closed');
  }

  if (redisUrl) {
    const subscriber = createRedisSubscriber();
    await subscriber.quit();
    console.log('Redis subscriber connection closed');
  }

  if (redisUrl) {
    const publisher = createRedisPublisher();
    await publisher.quit();
    console.log('Redis publisher connection closed');
  }
});
