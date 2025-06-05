import { Worker, Job } from 'bullmq';
import { prisma } from '../utils/prisma';
import config from '../config';
import { Logger } from '../utils/rollbar.logger';
import { ImageEffectJobData } from './imageEffectQueue';
import { GenerationStatus, Resolution } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createRedisPublisher, createRedisConnection } from '../utils/redis';
import { applyImageEffect } from '../services/fal-ai';
import { isMainThread, parentPort, workerData } from 'worker_threads';
import { createImageOpenAI, editImageOpenAI } from '../services/openai';
// import { generateJointPhoto } from '../services/runway';
// Initialize Redis connection with Railway-specific settings
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

// Constants
const QUEUE_NAME = 'image-effect-generation';
const UPLOAD_DIR = config.server.uploadDir;
const SUPPORT_USERNAME = process.env.TELEGRAM_SUPPORT_USERNAME || 'support';

// Group effects by processing service
const OPENAI_EFFECTS = [
  'claymation',
  'ghibli',
  'pixar',
  'bratz',
  'cat',
  'dog',
  'sticker',
  'new_disney',
  'old_disney',
  'mitchells',
  'dreamworks',
];
const FAL_AI_EFFECTS = ['plushify', 'ghiblify', 'cartoonify', 'cartoonify_2d', 'style_transfer'];

// Initialize resources
let redisConnection = createRedisConnection();
let redisPublisher = createRedisPublisher();

// i18n translations for effect worker
const translations = {
  en: {
    processing: '🔄 Processing image...',
    applying_effect: '🎨 Applying {{effect}} effect...',
    openai_processing: '✨ Adding final touches with AI...',
    effect_applied: "✅ Effect '{{effect}}' applied!",
    error_applying:
      "❌ Error applying effect '{{effect}}'. Please try again or contact @{{supportUsername}}.",
  },
  ru: {
    processing: '🔄 Обработка изображения...',
    applying_effect: '🎨 Применение эффекта {{effect}}...',
    openai_processing: '✨ Добавление финальных штрихов с ИИ...',
    effect_applied: "✅ Эффект '{{effect}}' применен!",
    error_applying:
      "❌ Ошибка при применении эффекта '{{effect}}'. Пожалуйста, попробуйте еще раз или свяжитесь с @{{supportUsername}}.",
  },
};

// Get localized message
function getMessage(key: string, language: string, params: Record<string, any> = {}): string {
  const lang = language === 'ru' ? 'ru' : 'en';
  const message = translations[lang][key];

  if (!message) return key;

  return Object.entries(params).reduce(
    (result, [param, value]) => result.replace(`{{${param}}}`, value),
    message
  );
}

/**
 * Downloads a file from Telegram using the bot core via Redis.
 * @param fileId - The Telegram file ID.
 * @returns The local path where the file was downloaded.
 */
async function downloadTelegramFile(fileId: string): Promise<string> {
  // Create a unique filename for the download
  const tempDir = path.join(UPLOAD_DIR, 'temp');
  await fs.mkdir(tempDir, { recursive: true });
  const filePath = path.join(tempDir, `${uuidv4()}-${fileId}.jpg`);

  // Request the bot to download the file via Redis
  await redisPublisher.publish(
    'bot:download_file',
    JSON.stringify({
      fileId,
      downloadPath: filePath,
    })
  );

  // Wait for the file to be downloaded
  const maxWaitTime = 25000; // 25 seconds
  const checkInterval = 3000; // 3 seconds
  let waitedTime = 0;

  while (waitedTime < maxWaitTime) {
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    waitedTime += checkInterval;

    try {
      const stats = await fs.stat(filePath);
      if (stats.size > 0) {
        return filePath;
      }
    } catch (error) {
      // File doesn't exist yet or error checking, continue waiting
    }
  }

  throw new Error(`Timed out after ${maxWaitTime}ms waiting for file download`);
}

/**
 * Downloads multiple files from Telegram using the bot core via Redis.
 * @param fileIds - Array of Telegram file IDs.
 * @returns Array of local paths where the files were downloaded.
 */
async function downloadMultipleTelegramFiles(fileIds: string[]): Promise<string[]> {
  return Promise.all(fileIds.map(fileId => downloadTelegramFile(fileId)));
}

/**
 * Processes an image effect generation job.
 */
async function processImageEffectJob(job: Job<ImageEffectJobData>): Promise<void> {
  // Логируем начало обработки задания
  Logger.info(`🚀 [ImageEffectWorker] Начинаем обработку задания ${job.id}`, {
    jobId: job.id,
    generationId: job.data.generationId,
    userId: job.data.userId,
    effect: job.data.effect,
    logoEffect: job.data.logoEffect,
    bannerEffect: job.data.bannerEffect,
    fileIds: job.data.fileIds,
    apiProvider: job.data.apiProvider,
    chatId: job.data.chatId,
    messageId: job.data.messageId,
  });

  const {
    generationId,
    userId,
    fileIds,
    effect,
    chatId,
    messageId,
    language,
    resolution = 'SQUARE',
    logoEffect,
    bannerEffect,
    roomDesignEffect,
    jointPhotoEffect,
    effectObject,
    prompt,
    apiProvider,
  } = job.data;

  let localFilePath: string | null = null;
  let localFilePaths: string[] = [];
  let finalOutputPath: string | null = null;
  const effectName = effect || logoEffect || bannerEffect || roomDesignEffect || jointPhotoEffect;

  try {
    // 1. Update status to PROCESSING
    Logger.info(`📝 [ImageEffectWorker] Обновляем статус генерации ${generationId} на PROCESSING`);
    await prisma.generation.update({
      where: { id: generationId },
      data: { status: GenerationStatus.PROCESSING },
    });

    Logger.info(`📤 [ImageEffectWorker] Отправляем статус-сообщение пользователю в чат ${chatId}`);
    await redisPublisher.publish(
      'bot:status_update',
      JSON.stringify({
        chatId,
        messageId,
        text: getMessage('processing', language),
      })
    );

    // 2. Download the original images from Telegram via bot core or create
    if (fileIds) {
      Logger.info(`📥 [ImageEffectWorker] Скачиваем ${fileIds.length} файлов из Telegram`, {
        fileIds,
      });
      localFilePaths = await downloadMultipleTelegramFiles(fileIds);
      Logger.info(`✅ [ImageEffectWorker] Файлы скачаны успешно`, { localFilePaths });
    } else {
      Logger.info(`📂 [ImageEffectWorker] Создание изображения без входных файлов`);
      localFilePath = path.join(UPLOAD_DIR, 'temp');
    }

    if (localFilePaths && localFilePaths.length === 1) {
      localFilePath = localFilePaths[0];
      Logger.info(`📄 [ImageEffectWorker] Используем единственный файл: ${localFilePath}`);
    }

    // 3. Apply effect based on type
    Logger.info(`🎨 [ImageEffectWorker] Применяем эффект: ${effectName}`, {
      effect,
      logoEffect,
      bannerEffect,
      apiProvider,
      fileIds: !!fileIds,
    });

    await redisPublisher.publish(
      'bot:status_update',
      JSON.stringify({
        chatId,
        messageId,
        text: getMessage('applying_effect', language, { effect: effectName }),
      })
    );

    // Generate image with OpenAI service
    if (!fileIds) {
      Logger.info(`🖼️ [ImageEffectWorker] Создание изображения через OpenAI createImageOpenAI`, {
        localFilePath,
        effect,
        resolution,
        logoEffect,
        bannerEffect,
        roomDesignEffect,
        prompt,
      });

      finalOutputPath = await createImageOpenAI(
        localFilePath,
        effect,
        resolution as Resolution,
        logoEffect,
        bannerEffect,
        roomDesignEffect,
        prompt
      );

      Logger.info(`✅ [ImageEffectWorker] Изображение создано через OpenAI`, { finalOutputPath });
    } else if (FAL_AI_EFFECTS.includes(effect)) {
      // Process with FAL AI
      Logger.info(`🤖 [ImageEffectWorker] Обработка через FAL AI`, { effect, localFilePath });
      finalOutputPath = await applyImageEffect(localFilePath, effect, resolution as Resolution);
      Logger.info(`✅ [ImageEffectWorker] Изображение обработано через FAL AI`, {
        finalOutputPath,
      });
    } else if (OPENAI_EFFECTS.includes(effect) && apiProvider === 'openai') {
      // Pass the resolution to OpenAI service
      Logger.info(
        `🎨 [ImageEffectWorker] Редактирование изображения через OpenAI editImageOpenAI`,
        {
          effect,
          localFilePath,
          resolution,
          logoEffect: job.data.logoEffect,
          apiProvider,
        }
      );

      finalOutputPath = await editImageOpenAI(
        localFilePath,
        effect,
        resolution as Resolution,
        job.data.logoEffect
      );

      Logger.info(`✅ [ImageEffectWorker] Изображение отредактировано через OpenAI`, {
        finalOutputPath,
      });
    } else if (
      job.data.logoEffect ||
      job.data.bannerEffect ||
      job.data.roomDesignEffect ||
      job.data.jointPhotoEffect
    ) {
      const effect =
        job.data.logoEffect ||
        job.data.bannerEffect ||
        job.data.roomDesignEffect ||
        job.data.jointPhotoEffect;

      if (apiProvider === 'openai') {
        Logger.info(`🏷️ [ImageEffectWorker] Применение логотипа/баннера через OpenAI`, {
          effect,
          apiProvider,
          localFilePath,
          resolution,
          effectObject,
          prompt,
        });

        finalOutputPath = await editImageOpenAI(
          localFilePath,
          effect,
          resolution as Resolution,
          job.data.logoEffect,
          job.data.bannerEffect,
          job.data.roomDesignEffect,
          job.data.jointPhotoEffect,
          job.data.effectObject,
          prompt
        );
      } 
      // else if (apiProvider === 'runway') {
      //   finalOutputPath = await generateJointPhoto(
      //     localFilePaths,
      //     prompt,
      //     resolution as Resolution
      //   );
      // }
    } else {
      const errorMsg = `Unsupported effect type: ${effect}`;
      Logger.error(`❌ [ImageEffectWorker] ${errorMsg}`, {
        effect,
        logoEffect,
        bannerEffect,
        roomDesignEffect,
        jointPhotoEffect,
        apiProvider,
        fileIds: !!fileIds,
      });
      throw new Error(errorMsg);
    }

    if (!finalOutputPath) {
      const errorMsg = 'No output path returned from effect processing';
      Logger.error(`❌ [ImageEffectWorker] ${errorMsg}`, {
        effect,
        apiProvider,
        fileIds: !!fileIds,
      });
      throw new Error(errorMsg);
    }

    // 4. Save the final image to the user's directory
    const outputDir = path.join(UPLOAD_DIR, userId, generationId);
    Logger.info(`📁 [ImageEffectWorker] Создаем директорию пользователя: ${outputDir}`);
    await fs.mkdir(outputDir, { recursive: true });

    // 5. Copy the final image to the user's directory if needed
    if (finalOutputPath !== path.join(outputDir, 'final_effect_image.jpg')) {
      const userFilePath = path.join(outputDir, 'final_effect_image.jpg');
      Logger.info(`📋 [ImageEffectWorker] Копируем финальное изображение`, {
        from: finalOutputPath,
        to: userFilePath,
      });

      const fileContent = await fs.readFile(finalOutputPath);
      await fs.writeFile(userFilePath, fileContent);
      finalOutputPath = userFilePath;

      Logger.info(`✅ [ImageEffectWorker] Файл скопирован успешно: ${finalOutputPath}`);
    } else {
      Logger.info(`📄 [ImageEffectWorker] Файл уже в правильной директории: ${finalOutputPath}`);
    }

    // 6. Decrement user generations (atomic operation)
    Logger.info(`📊 [ImageEffectWorker] Уменьшаем количество генераций пользователя ${userId}`);
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { remainingGenerations: { decrement: 1 } },
    });
    Logger.info(
      `✅ [ImageEffectWorker] Генерации обновлены, осталось: ${updatedUser.remainingGenerations}`
    );

    // 7. Update Generation record to COMPLETED
    Logger.info(`💾 [ImageEffectWorker] Обновляем статус генерации ${generationId} на COMPLETED`);
    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: GenerationStatus.COMPLETED,
        imageUrls: [finalOutputPath],
      },
    });
    Logger.info(`✅ [ImageEffectWorker] Статус генерации обновлен на COMPLETED`);

    // 8. Notify user via Redis with the effect results
    Logger.info(`📤 [ImageEffectWorker] Отправляем результат пользователю`, {
      chatId,
      userId,
      generationId,
      effect: effectName,
      finalOutputPath,
    });

    await redisPublisher.publish(
      'bot:send_effect',
      JSON.stringify({
        chatId,
        imageData: {
          path: finalOutputPath,
          isUrl: false,
        },
        userId,
        referralCode: updatedUser?.referralCode || '',
        language,
        generationId,
        effect,
      })
    );

    Logger.info(
      `🎉 [ImageEffectWorker] Задание ${job.id} для генерации ${generationId} успешно завершено!`
    );
  } catch (error) {
    Logger.error(`💥 [ImageEffectWorker] Job ${job.id} failed for generation ${generationId}`, {
      error: error.message,
      stack: error.stack,
      effect: effectName,
      userId,
      fileIds,
      apiProvider,
    });

    // Update status to FAILED
    await prisma.generation
      .update({
        where: { id: generationId },
        data: { status: GenerationStatus.FAILED, error: error.message },
      })
      .catch(updateErr =>
        Logger.error('Failed to update generation status to FAILED', { updateErr })
      );

    // Notify user of failure via Redis
    await redisPublisher
      .publish(
        'bot:status_update',
        JSON.stringify({
          chatId,
          messageId,
          text: getMessage('error_applying', language, {
            effect,
            supportUsername: SUPPORT_USERNAME,
          }),
        })
      )
      .catch(pubErr => Logger.error('Failed to publish error status update', { pubErr }));

    // Re-throw the error so BullMQ marks the job as failed
    throw error;
  } finally {
    try {
      // Clean up temporary downloaded file
      if (localFilePath && fileIds) {
        await fs
          .unlink(localFilePath)
          .catch(unlinkErr =>
            Logger.warn(`Failed to delete temp file ${localFilePath}`, { unlinkErr })
          );
      }
    } catch (cleanupError) {
      Logger.warn('Error during cleanup', { cleanupError });
    }
  }
}

// Create the worker
function createWorker() {
  try {
    return new Worker<ImageEffectJobData>(QUEUE_NAME, processImageEffectJob, {
      connection: redisConfig,
      concurrency: parseInt(process.env.EFFECT_WORKER_CONCURRENCY || '3', 10),
      stalledInterval: 10000, // Check for stalled jobs every 30 seconds
      lockDuration: 300000, // Lock jobs for 5 minutes
    });
  } catch (error) {
    Logger.error('Failed to create imageEffectWorker:', error);
    
    // Notify parent thread of initialization failure
    if (!isMainThread && parentPort) {
      parentPort.postMessage({ 
        type: 'error', 
        worker: workerData?.workerName || 'imageEffectWorker', 
        error: error.message 
      });
    }
    
    throw error;
  }
}

// Graceful shutdown handler
const gracefulShutdown = async () => {
  try {
    if (worker) {
      Logger.info('🛑 [ImageEffectWorker] Закрываем worker...');
      await worker.close();
    }

    if (redisPublisher) {
      Logger.info('🛑 [ImageEffectWorker] Закрываем Redis publisher...');
      await redisPublisher.quit();
    }

    Logger.info('✅ [ImageEffectWorker] Graceful shutdown завершен');
  } catch (error) {
    Logger.error('❌ [ImageEffectWorker] Error during worker shutdown:', error);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Create and initialize worker
const worker = createWorker();

// Set up worker events
worker.on('failed', (job: Job<ImageEffectJobData>, err: Error) => {
  Logger.error(`Job ${job.id} failed for generation ${job.data.generationId}`, {
    error: err,
    attemptsMade: job.attemptsMade,
  });
});

worker.on('error', err => {
  Logger.error('BullMQ Worker Error', { error: err });
});

// If running in a worker thread, notify parent when ready
if (!isMainThread && parentPort) {
  parentPort.postMessage({ type: 'ready', worker: workerData?.workerName || 'imageEffectWorker' });

  // Listen for messages from the parent thread
  parentPort.on('message', message => {
    if (message.type === 'shutdown') {
      gracefulShutdown();
    }
  });
}

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', error => {
  Logger.error('Uncaught exception in imageEffectWorker:', error);
  gracefulShutdown().catch(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled rejection in imageEffectWorker:', { reason, promise });
  gracefulShutdown().catch(() => process.exit(1));
});

export default worker;
