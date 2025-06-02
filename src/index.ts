import 'dotenv/config';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import path from 'path';
import staticPlugin from '@fastify/static';
import { startBot, stopBot } from './bot';
import i18next from './i18n';
import middleware from 'i18next-http-middleware';
import config from './config';
import { setupCleanupTask } from './services/cleanup';
import { launchWorkers, stopWorkers } from './workers';
import { fastifyFormbody } from '@fastify/formbody';
// Import routes
import authRoutes from './routes/auth';
import generationRoutes from './routes/generation';
import referralRoutes from './routes/referrals';
import paymentRoutes from './routes/payments';
import adminRoutes from './routes/admin';
import botRoutes from './routes/bot';
import healthRoutes from './routes/health';
import { Logger } from './utils/rollbar.logger';
import { disconnectPrisma } from './utils/prisma';
import { closeAllRedisConnections } from './utils/redis';
import fs from 'fs';

/**
 * Service state tracking
 */
const serviceState = {
  botStarted: false,
  workersInitialized: false,
  cleanupTask: null as any,
  server: null as FastifyInstance | null,
  botHealthCheckInterval: null as NodeJS.Timeout | null,
  isBotRestarting: false,
  isShuttingDown: false, // Add flag to prevent multiple shutdown attempts
};

/**
 * Create and configure Fastify server
 */
function createServer(): FastifyInstance {
  // Initialize Fastify server
  const server = Fastify();

  // Register CORS plugin
  server.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  server.register(fastifyFormbody);

  // Register JWT plugin
  server.register(jwt, {
    secret: config.server.jwtSecret,
  });

  // Add i18n middleware
  server.register(middleware.plugin, {
    i18next,
    ignoreRoutes: ['/uploads/', '/client/'],
  });

  // JWT authentication decorator
  server.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  return server;
}

/**
 * Register API routes
 */
function registerRoutes(server: FastifyInstance) {
  server.register(authRoutes, { prefix: '/api/auth' });
  server.register(generationRoutes, { prefix: '/api/generation' });
  server.register(referralRoutes, { prefix: '/api/referrals' });
  server.register(paymentRoutes, { prefix: '/api/payments' });
  server.register(adminRoutes, { prefix: '/api/admin' });

  // Register admin panel routes - instead of registering the same routes twice,
  // we'll use a setNotFoundHandler to serve the admin SPA for all /admin routes
  server.register(botRoutes, { prefix: '/api/bot' });
  server.register(healthRoutes);

  // 1. Сервировка папки uploads
  server.register(staticPlugin, {
    root: path.join(process.cwd(), config.server.uploadDir),
    prefix: '/uploads/',
    decorateReply: false,
  });

  // 2. Сервировка статики фронтенда админки
  const adminDistPath = path.join(process.cwd(), 'client/admin/dist');
  server.register(staticPlugin, {
    root: adminDistPath,
    prefix: '/admin/',
    decorateReply: false,
    index: false,
  });

  // 3. Обработчик 404 для SPA админки (регистрируем ПОСЛЕ статики, используя after())
  server.after(() => {
    server.setNotFoundHandler((req, reply) => {
      // Проверяем, начинается ли путь с /admin
      if (req.raw.url && req.raw.url.startsWith('/admin')) {
        const indexPath = path.join(adminDistPath, 'index.html');
        // Проверяем существует ли файл
        if (!fs.existsSync(indexPath)) {
          Logger.error(new Error(`Admin index.html not found at ${indexPath}`), {
            context: 'NotFoundHandler',
            path: req.raw.url,
          });
          reply.code(404).send('Admin panel not found. Did you build the admin frontend?');
          return;
        }

        // Читаем файл вручную
        fs.readFile(indexPath, (err, fileBuffer) => {
          if (err) {
            Logger.error(err, { context: 'NotFoundHandler', path: req.raw.url });
            reply.code(500).send('Error reading admin index.html');
          } else {
            // Отправляем содержимое с правильным Content-Type
            reply.code(200).header('Content-Type', 'text/html; charset=UTF-8').send(fileBuffer);
          }
        });
        return; // Важно завершить выполнение здесь, т.к. readFile асинхронен
      }
      // Если это не /admin, отдаем стандартный 404
      reply.code(404).send('Not Found');
    });
  });
}

/**
 * Initialize Telegram bot
 */
async function initializeBot() {
  try {
    await startBot();
    serviceState.botStarted = true;
    console.log('Telegram bot started successfully');
    return true;
  } catch (error) {
    Logger.critical('Failed to start Telegram bot:', error);
    return false;
  }
}

/**
 * Setup a health check for the bot and restart it if nee
/**
 * Start the HTTP server
 */
async function startServer(server: FastifyInstance, port: number) {
  try {
    await server.listen({
      port,
      host: '0.0.0.0',
    });

    // Log explicit server address
    const serverAddress = server.server.address();
    if (serverAddress && typeof serverAddress !== 'string') {
      console.log(`Server address details: ${serverAddress.address}:${serverAddress.port}`);
    }

    serviceState.server = server;

    return true;
  } catch (error) {
    Logger.critical('Failed to start HTTP server:', error);
    return false;
  }
}

/**
 * Initialize cleanup tasks
 */
function initializeCleanupTasks() {
  try {
    const cleanupTask = setupCleanupTask();
    serviceState.cleanupTask = cleanupTask;
    console.log('Periodic cleanup task started');
    return true;
  } catch (error) {
    Logger.critical('Failed to setup cleanup tasks:', error);
    return false;
  }
}

/**
 * Initialize workers in separate threads
 */
async function initializeWorkers() {
  try {
    console.log('Initializing workers in separate threads...');

    // Launch workers manager
    launchWorkers();

    serviceState.workersInitialized = true;
    console.log('Workers initialized successfully in separate threads');
    return true;
  } catch (error) {
    Logger.critical('Failed to initialize workers:', error);
    return false;
  }
}

/**
 * Graceful shutdown of all services
 */
async function shutdownServices() {
  // Prevent multiple shutdown attempts
  if (serviceState.isShuttingDown) {
    console.log('Shutdown already in progress, skipping...');
    return;
  }

  serviceState.isShuttingDown = true;
  let shutdownSuccessful = true;

  console.log('Gracefully shutting down services...');

  // Stop the bot health check if it exists
  if (serviceState.botHealthCheckInterval) {
    clearInterval(serviceState.botHealthCheckInterval);
    serviceState.botHealthCheckInterval = null;
    console.log('Bot health check stopped');
  }

  // Stop the cleanup task if it exists
  if (serviceState.cleanupTask) {
    try {
      serviceState.cleanupTask.stop();
      console.log('Cleanup task stopped');
    } catch (err) {
      Logger.error('Error stopping cleanup task:', err);
      shutdownSuccessful = false;
    }
  }

  // Stop the bot if it was started
  if (serviceState.botStarted) {
    try {
      await stopBot();
      console.log('Bot stopped');
    } catch (err) {
      Logger.error('Error stopping bot:', err);
      shutdownSuccessful = false;
    }
  }

  // Stop workers if they were initialized
  if (serviceState.workersInitialized) {
    try {
      const workersShutdown = await stopWorkers();
      if (!workersShutdown) {
        Logger.warn('Some workers did not shut down cleanly');
        shutdownSuccessful = false;
      } else {
        console.log('All workers shut down successfully');
      }
    } catch (err) {
      Logger.error('Error stopping workers:', err);
      shutdownSuccessful = false;
    }
  }

  // Close all Redis connections
  try {
    await closeAllRedisConnections();
  } catch (err) {
    Logger.error('Error closing Redis connections:', err);
    shutdownSuccessful = false;
  }

  // Close Prisma connection
  try {
    await disconnectPrisma();
  } catch (err) {
    Logger.error('Error disconnecting Prisma:', err);
    shutdownSuccessful = false;
  }

  // Close the server
  if (serviceState.server) {
    try {
      await serviceState.server.close();
      console.log('Server closed');
    } catch (err) {
      Logger.error('Error closing server:', err);
      shutdownSuccessful = false;
    }
  }

  if (shutdownSuccessful) {
    console.log('All services shut down successfully');
  } else {
    Logger.warn('Some services encountered errors during shutdown');
    console.warn('Some services encountered errors during shutdown');
  }

  // Force exit after a timeout
  setTimeout(() => {
    console.log('Force exiting application');
    process.exit(shutdownSuccessful ? 0 : 1);
  }, 2000);

  return shutdownSuccessful;
}

/**
 * Register signal handlers
 */
function registerSignalHandlers() {
  // Use once to ensure handlers are only registered once
  process.once('SIGINT', shutdownServices);
  process.once('SIGTERM', shutdownServices);

  // Handle uncaught exceptions and unhandled rejections - use once to prevent loops
  process.once('uncaughtException', error => {
    Logger.critical('Uncaught exception:', error);
    shutdownServices();
  });

  process.once('unhandledRejection', (reason, promise) => {
    Logger.critical('Unhandled rejection at:', promise);
    shutdownServices();
  });
}

/**
 * Start the application
 */
async function startApplication() {
  try {
    // Create and configure the server
    const server = createServer();

    // Register routes
    registerRoutes(server);

    // Start the server
    const port = parseInt(process.env.PORT || '3000', 10);
    const serverStarted = await startServer(server, port);

    if (!serverStarted) {
      Logger.critical('Server failed to start, exiting application');
      process.exit(1);
    }

    console.log(`Server started successfully on port ${port}`);
    const workersStarted = await initializeWorkers();

    initializeCleanupTasks();

    // Register signal handlers for graceful shutdown
    registerSignalHandlers();

    // Initialize the Telegram bot

    // Setup bot health check

    const botStarted = await initializeBot();
    if (!botStarted) {
      console.warn('Bot failed to start, but continuing with other services');
    }

    if (!workersStarted) {
      console.warn('Workers failed to initialize, job processing may not work correctly');
    }

    return true;
  } catch (error) {
    Logger.critical('Failed to start application:', error);
    return false;
  }
}

// Start the application
startApplication();
