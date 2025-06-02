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

// Track all Redis connections for cleanup
const activeConnections = new Set<Redis>();

// Add connection throttling to prevent race conditions
let connectionCreationCount = 0;
const MAX_CONCURRENT_CONNECTIONS = 10;

/**
 * Creates and returns a general Redis connection.
 * Caller is responsible for handling errors and closing the connection.
 */
export function createRedisConnection(): Redis {
  if (!redisUrl) throw new Error('Redis URL не найден');

  if (connectionCreationCount >= MAX_CONCURRENT_CONNECTIONS) {
    throw new Error(
      `Too many Redis connections (${connectionCreationCount}). Max allowed: ${MAX_CONCURRENT_CONNECTIONS}`
    );
  }

  connectionCreationCount++;
  console.log(
    `Creating Redis connection... (${connectionCreationCount}/${MAX_CONCURRENT_CONNECTIONS})`
  );

  const connection = new Redis(redisUrl, connectionOptions);

  connection.on('error', err => {
    Logger.error(err, { context: 'Redis Connection' });
    console.error('Redis connection error:', err.message);
  });

  connection.on('connect', () => {
    console.log(`Redis connection established (${connectionCreationCount})`);
  });

  connection.on('ready', () => {
    console.log(`Redis connection ready (${connectionCreationCount})`);
  });

  connection.on('close', () => {
    connectionCreationCount = Math.max(0, connectionCreationCount - 1);
    console.log(`Redis connection closed (remaining: ${connectionCreationCount})`);
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

  // Add small delay to avoid race conditions with other connections
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('Testing Redis connection...');
  console.log('Redis URL:', redisUrl.replace(/:[^:@]*@/, ':***@'));

  let testConnection: Redis | null = null;

  try {
    testConnection = new Redis(redisUrl, {
      connectTimeout: 8000, // Increased timeout
      lazyConnect: true,
      // Railway требует family: 0 для dual stack lookup
      family: 0,
      retryStrategy: () => null, // Don't retry for test
    });

    await testConnection.connect();
    await testConnection.ping();
    console.log('✅ Redis connection test successful');
    return true;
  } catch (error) {
    console.error('❌ Redis connection test failed:', error.message);
    console.error('Error code:', error.code);

    // Log additional details for debugging
    if (error.code === 'ENOTFOUND') {
      console.error('\n🔍 DNS RESOLUTION FAILED:');
      console.error('Trying Railway-specific solutions...');
      console.error('\n💡 RAILWAY REDIS SOLUTIONS:');
      console.error('1. Using family: 0 for dual stack lookup (current attempt)');
      console.error('2. If still failing, try REDIS_PUBLIC_URL instead of REDIS_URL');
      console.error('3. Ensure Redis service is in the same Railway project');
      console.error('4. Try adding ?family=0 to REDIS_URL manually');

      // Extract hostname for additional info
      const hostname = error.hostname || 'unknown';
      console.error(`\n🌐 Failed hostname: ${hostname}`);

      if (hostname.includes('railway.internal')) {
        console.error('→ Railway internal network issue - trying family: 0');
      } else if (hostname.includes('rlwy.net')) {
        console.error('→ Railway proxy network - should work with family: 0');
      }
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
