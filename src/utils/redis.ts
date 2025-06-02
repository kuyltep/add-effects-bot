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
  maxRetriesPerRequest: 1,
  enableReadyCheck: true,
  connectTimeout: 10000,
  lazyConnect: true,
  // Disable automatic reconnection on shutdown
  retryStrategy: (times: number) => {
    // Only retry a few times, then give up
    if (times > 3) {
      return null; // Stop retrying
    }
    return Math.min(times * 1000, 3000);
  },
};

// Track all Redis connections for cleanup
const activeConnections = new Set<Redis>();

/**
 * Creates and returns a general Redis connection.
 * Caller is responsible for handling errors and closing the connection.
 */
export function createRedisConnection(): Redis {
  if (!redisUrl) throw new Error('Redis URL не найден');

  const connection = new Redis(redisUrl, connectionOptions);
  connection.on('error', err => Logger.error(err, { context: 'Redis Connection' }));

  // Track the connection
  activeConnections.add(connection);

  // Remove from tracking when closed
  connection.on('close', () => {
    activeConnections.delete(connection);
  });

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

  // Track the connection
  activeConnections.add(subscriber);

  // Remove from tracking when closed
  subscriber.on('close', () => {
    activeConnections.delete(subscriber);
  });

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

  // Track the connection
  activeConnections.add(publisher);

  // Remove from tracking when closed
  publisher.on('close', () => {
    activeConnections.delete(publisher);
  });

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

/**
 * Close all active Redis connections
 * Should be called during application shutdown
 */
export async function closeAllRedisConnections(): Promise<void> {
  console.log(`Closing ${activeConnections.size} active Redis connections...`);

  const closePromises = Array.from(activeConnections).map(async connection => {
    try {
      if (connection.status === 'ready' || connection.status === 'connecting') {
        // Special handling for subscriber connections
        try {
          // Check if this connection has active subscriptions (subscriber pattern)
          if (typeof (connection as any).unsubscribe === 'function') {
            await (connection as any).unsubscribe();
            console.log('Unsubscribed from Redis channels');
          }
        } catch (unsubError) {
          console.warn('Error unsubscribing from Redis channels:', unsubError);
        }

        await connection.quit();
      } else if (connection.status !== 'end' && connection.status !== 'close') {
        connection.disconnect();
      }
    } catch (error) {
      Logger.error('Error closing Redis connection:', error);
      // Force disconnect if quit fails
      try {
        connection.disconnect();
      } catch (disconnectError) {
        Logger.error('Error force disconnecting Redis connection:', disconnectError);
      }
    }
  });

  await Promise.all(closePromises);
  activeConnections.clear();
  console.log('All Redis connections closed');
}
