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

// Debug Redis URL (mask password for security)
console.log('Redis URL configured:', redisUrl ? redisUrl.replace(/:[^:@]*@/, ':***@') : 'NOT SET');
console.log('NODE_ENV:', process.env.NODE_ENV);

// Connection options
const connectionOptions = {
  maxRetriesPerRequest: 1,
  enableReadyCheck: true,
  connectTimeout: 10000,
  lazyConnect: true,
  // Let the system decide between IPv4/IPv6 based on DNS resolution
  // Don't force family, support both IPv4 and IPv6
  // Disable automatic reconnection on shutdown
  retryStrategy: (times: number) => {
    console.log(`Redis retry attempt ${times}`);
    // Only retry a few times, then give up
    if (times > 3) {
      console.log('Redis retries exhausted, giving up');
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

  console.log('Creating Redis connection...');
  const connection = new Redis(redisUrl, connectionOptions);

  connection.on('error', err => {
    Logger.error(err, { context: 'Redis Connection' });
    console.error('Redis connection error:', err.message);
  });

  connection.on('connect', () => {
    console.log('Redis connection established');
  });

  connection.on('ready', () => {
    console.log('Redis connection ready');
  });

  connection.on('close', () => {
    console.log('Redis connection closed');
    activeConnections.delete(connection);
  });

  // Track the connection
  activeConnections.add(connection);

  return connection;
}

/**
 * Creates a Redis subscriber.
 * For long-lived subscriptions, caller must handle errors and closing.
 */
export function createRedisSubscriber(): Redis {
  if (!redisUrl) throw new Error('Redis URL не найден');

  console.log('Creating Redis subscriber...');
  const subscriber = new Redis(redisUrl, connectionOptions);

  subscriber.on('error', err => {
    Logger.error(err, { context: 'Redis Subscriber' });
    console.error('Redis subscriber error:', err.message);
  });

  subscriber.on('connect', () => {
    console.log('Redis subscriber connected');
  });

  subscriber.on('ready', () => {
    console.log('Redis subscriber ready');
  });

  subscriber.on('close', () => {
    console.log('Redis subscriber closed');
    activeConnections.delete(subscriber);
  });

  // Track the connection
  activeConnections.add(subscriber);

  return subscriber;
}

/**
 * Creates a Redis publisher.
 * For one-off publishing, use publishMessage instead to handle connection lifecycle.
 */
export function createRedisPublisher(): Redis {
  if (!redisUrl) throw new Error('Redis URL не найден');

  console.log('Creating Redis publisher...');
  const publisher = new Redis(redisUrl, connectionOptions);

  publisher.on('error', err => {
    Logger.error(err, { context: 'Redis Publisher' });
    console.error('Redis publisher error:', err.message);
  });

  publisher.on('connect', () => {
    console.log('Redis publisher connected');
  });

  publisher.on('ready', () => {
    console.log('Redis publisher ready');
  });

  publisher.on('close', () => {
    console.log('Redis publisher closed');
    activeConnections.delete(publisher);
  });

  // Track the connection
  activeConnections.add(publisher);

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
 * Test Redis connection
 */
export async function testRedisConnection(): Promise<boolean> {
  if (!redisUrl) {
    console.log('Redis URL not configured, skipping Redis test');
    return false;
  }

  console.log('Testing Redis connection...');
  let testConnection: Redis | null = null;

  try {
    testConnection = new Redis(redisUrl, {
      connectTimeout: 5000,
      lazyConnect: true,
      // Support both IPv4 and IPv6 - let system decide based on DNS
      retryStrategy: () => null, // Don't retry for test
    });

    await testConnection.connect();
    await testConnection.ping();
    console.log('Redis connection test successful');
    return true;
  } catch (error) {
    console.error('Redis connection test failed:', error.message);

    // Log additional details for debugging
    if (error.code === 'ENOTFOUND') {
      console.error('DNS resolution failed. Check:');
      console.error('1. Redis service is running');
      console.error('2. REDIS_URL environment variable is correct');
      console.error('3. Network connectivity to Redis host');
    }

    return false;
  } finally {
    if (testConnection) {
      try {
        await testConnection.quit();
      } catch (err) {
        console.warn('Error closing test connection:', err.message);
      }
    }
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
