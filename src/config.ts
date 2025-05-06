/**
 * Central configuration file for the application
 * This file contains all environment variables and configuration settings
 */

// Server configuration
export const serverConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || 'localhost',
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-this-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
};

// Database configuration
export const dbConfig = {
  url: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/reve-tg',
  logLevel: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
};

// Redis configuration
export const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  maxRetriesPerRequest: 1,
  reconnectOnError: true,
};

// Telegram bot configuration
export const botConfig = {
  token: process.env.TELEGRAM_BOT_TOKEN || '',
  webhookDomain: process.env.WEBHOOK_DOMAIN || '',
  useWebhook: process.env.NODE_ENV === 'production',
  botUsername: process.env.BOT_USERNAME || '',
};

// OpenAI configuration
export const openaiConfig = {
  apiKey: process.env.OPENAI_API_KEY || '',
  defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4.1-nano',
  translationTemperature: 0.3,
};

// Payment configuration (Robokassa)
export const paymentConfig = {
  robokassa: {
    login: process.env.ROBOKASSA_LOGIN || '',
    password1: process.env.ROBOKASSA_PASSWORD1 || '',
    password2: process.env.ROBOKASSA_PASSWORD2 || '',
    testMode: process.env.ROBOKASSA_TEST_MODE === 'true',
  },
};

// Generation packages configuration
export const packagesConfig = {
  package1: {
    name: process.env.PACKAGE_1_NAME || '100 Generations',
    price: parseInt(process.env.PACKAGE_1_PRICE || '490', 10),
    type: 'package',
    count: parseInt(process.env.PACKAGE_1_COUNT || '100', 10),
  },
  package2: {
    name: process.env.PACKAGE_2_NAME || '250 Generations',
    price: parseInt(process.env.PACKAGE_2_PRICE || '990', 10),
    type: 'package',
    count: parseInt(process.env.PACKAGE_2_COUNT || '250', 10),
  },
  package3: {
    name: process.env.PACKAGE_3_NAME || '500 Generations',
    price: parseInt(process.env.PACKAGE_3_PRICE || '1790', 10),
    type: 'package',
    count: parseInt(process.env.PACKAGE_3_COUNT || '500', 10),
  },
  package4: {
    name: process.env.PACKAGE_4_NAME || '1000 Generations',
    price: parseInt(process.env.PACKAGE_4_PRICE || '2990', 10),
    type: 'package',
    count: parseInt(process.env.PACKAGE_4_COUNT || '1000', 10),
  },
};

// Admin configuration
export const adminConfig = {
  password: process.env.ADMIN_PASSWORD || 'admin',
};

// Queue configuration
export const queueConfig = {
  jobRetryAttempts: 2,
  jobRetryDelay: 10000,
  removeCompletedAfter: 3600, // 1 hour in seconds
  removeFailedAfter: 7200, // 2 hours in seconds
};

// Default generation settings
export const defaultGenerationSettings = {
  width: 1024,
  height: 768,
  randomSeed: true,
  batchSize: 1,
  model: 'v1',
};

export const videoConfig = {
  falEffects: ['hug', 'kiss', 'jesus', 'microwave'],
  effectMap: {
    hug: 'Hug',
    kiss: 'Kiss',
    jesus: 'Warmth of Jesus',
    microwave: 'Microwave',
  },
}

export default {
  server: serverConfig,
  db: dbConfig,
  redis: redisConfig,
  bot: botConfig,
  openai: openaiConfig,
  payment: paymentConfig,
  packages: packagesConfig,
  admin: adminConfig,
  queue: queueConfig,
  defaultGenerationSettings,
  video: videoConfig,
};
