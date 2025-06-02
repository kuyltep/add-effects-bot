import { Redis } from 'ioredis';
import config from '../config';
import { Logger } from './rollbar.logger';

// Redis connection details
const redisUrl = config.redis.url;
if (!redisUrl) {
  Logger.error(
    'Критическая ошибка: Переменная окружения REDIS_URL или значение по умолчанию в config.redis.url не установлено!'
  );
}

// Connection registry to track all active connections
const activeConnections = new Set<Redis>();

// Connection options
const connectionOptions = {
  enableReadyCheck: true,
  connectTimeout: 10000,
  lazyConnect: true,
  // Railway требует dual stack lookup для redis.railway.internal
  // family: 0 означает поддержку как IPv4 так и IPv6 (dual stack)
  family: 0,
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

/**
 * Registers a connection for tracking and cleanup
 */
function registerConnection(connection: Redis, context: string): Redis {
  activeConnections.add(connection);
  
  connection.on('error', err => Logger.error(err, { context }));
  
  // Remove from registry when connection is closed
  connection.on('end', () => {
    activeConnections.delete(connection);
  });
  
  return connection;
}

/**
 * Creates and returns a general Redis connection.
 * Caller is responsible for handling errors and closing the connection.
 */
export function createRedisConnection(): Redis {
  if (!redisUrl) throw new Error('Redis URL не найден');


  const connection = new Redis(redisUrl, connectionOptions);
  return registerConnection(connection, 'Redis Connection');
}

/**
 * Creates a Redis subscriber.
 * For long-lived subscriptions, caller must handle errors and closing.
 */
export function createRedisSubscriber(): Redis {
  if (!redisUrl) throw new Error('Redis URL не найден');

  console.log('Creating Redis subscriber...');
  const subscriber = new Redis(redisUrl, connectionOptions);
  return registerConnection(subscriber, 'Redis Subscriber');
}

/**
 * Creates a Redis publisher.
 * For one-off publishing, use publishMessage instead to handle connection lifecycle.
 */
export function createRedisPublisher(): Redis {
  if (!redisUrl) throw new Error('Redis URL не найден');

  console.log('Creating Redis publisher...');
  const publisher = new Redis(redisUrl, connectionOptions);
  return registerConnection(publisher, 'Redis Publisher');
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
 * Closes all active Redis connections
 */
export async function closeAllRedisConnections(): Promise<void> {
  Logger.info(`Closing ${activeConnections.size} active Redis connections...`);
  
  const closePromises = Array.from(activeConnections).map(async (connection) => {
    try {
      if (connection.status === 'ready' || connection.status === 'connecting') {
        await connection.quit();
        Logger.info('Redis connection closed successfully');
      }
    } catch (error) {
      Logger.error('Error closing Redis connection:', error);
    }
  });

  await Promise.all(closePromises);
  activeConnections.clear();
  Logger.info('All Redis connections closed');
}

/**
 * Get the number of active connections (for monitoring)
 */
export function getActiveConnectionCount(): number {
  return activeConnections.size;
}

// Handle shutdown properly
process.on('beforeExit', async () => {
  await closeAllRedisConnections();
});

process.on('SIGINT', async () => {
  await closeAllRedisConnections();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeAllRedisConnections();
  process.exit(0);
});
