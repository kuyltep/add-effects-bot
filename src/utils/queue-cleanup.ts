import { Queue } from 'bullmq';
import { prisma } from './prisma';
import { GenerationStatus } from '@prisma/client';
import { Logger } from './rollbar.logger';
import config from '../config';

/**
 * Утилита для очистки очередей и сброса застрявших задач
 */

// Создаем Redis конфигурацию
const getRedisConfig = () => {
  if (!config.redis.url) return null;

  const redisURL = new URL(config.redis.url);
  const redisConfig: any = {
    host: redisURL.hostname,
    port: parseInt(redisURL.port) || 6379,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  };

  if (redisURL.username) {
    redisConfig.username = redisURL.username;
  }
  if (redisURL.password) {
    redisConfig.password = redisURL.password;
  }

  // Railway требует dual stack lookup только для внутренних соединений
  if (redisURL.hostname.includes('railway.internal') || redisURL.hostname.includes('rlwy.net')) {
    redisConfig.family = 0;
  }

  return redisConfig;
};

/**
 * Очищает все BullMQ очереди
 */
export async function clearAllQueues(): Promise<void> {
  const redisConfig = getRedisConfig();
  if (!redisConfig) {
    Logger.warn('Redis не настроен, пропускаем очистку очередей');
    return;
  }

  const queueNames = ['image-effect-generation', 'video-generation', 'upgrade-generation'];

  Logger.info('🧹 Начинаем очистку всех очередей...', { queueNames });

  for (const queueName of queueNames) {
    try {
      const queue = new Queue(queueName, { connection: redisConfig });

      // Получаем статистику до очистки
      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();
      const delayed = await queue.getDelayed();

      Logger.info(`📊 Статистика очереди ${queueName}:`, {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      });

      // Очищаем все типы задач (исправленные статусы для BullMQ)
      await queue.clean(0, 0, 'wait'); // waiting -> wait
      await queue.clean(0, 0, 'active');
      await queue.clean(0, 0, 'completed');
      await queue.clean(0, 0, 'failed');
      await queue.clean(0, 0, 'delayed');

      // Дополнительно удаляем все задачи
      await queue.obliterate({ force: true });

      await queue.close();

      Logger.info(`✅ Очередь ${queueName} полностью очищена`);
    } catch (error) {
      Logger.error(`❌ Ошибка при очистке очереди ${queueName}:`, error);
    }
  }

  Logger.info('🎉 Очистка всех очередей завершена');
}

/**
 * Сбрасывает статусы застрявших задач в базе данных
 */
export async function resetStuckGenerations(): Promise<void> {
  try {
    Logger.info('🔄 Сбрасываем статусы застрявших генераций в БД...');

    // Находим все задачи в статусах PENDING и PROCESSING
    const stuckGenerations = await prisma.generation.findMany({
      where: {
        status: {
          in: [GenerationStatus.PENDING, GenerationStatus.PROCESSING],
        },
      },
      select: {
        id: true,
        userId: true,
        status: true,
        createdAt: true,
      },
    });

    Logger.info(`📋 Найдено ${stuckGenerations.length} застрявших генераций`);

    if (stuckGenerations.length > 0) {
      // Обновляем статусы на FAILED с пометкой о сбросе
      const updateResult = await prisma.generation.updateMany({
        where: {
          status: {
            in: [GenerationStatus.PENDING, GenerationStatus.PROCESSING],
          },
        },
        data: {
          status: GenerationStatus.FAILED,
          error: 'Сброшено при очистке очередей - задача была застряла',
        },
      });

      Logger.info(`✅ Обновлено ${updateResult.count} застрявших генераций на статус FAILED`);

      // Логируем детали для мониторинга
      const userCounts = stuckGenerations.reduce(
        (acc, gen) => {
          acc[gen.userId] = (acc[gen.userId] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      Logger.info('👥 Статистика по пользователям:', userCounts);
    }
  } catch (error) {
    Logger.error('❌ Ошибка при сбросе статусов генераций:', error);
    throw error;
  }
}

/**
 * Полная очистка: очищает очереди и сбрасывает статусы в БД
 */
export async function fullCleanup(): Promise<void> {
  try {
    Logger.info('🚀 Начинаем полную очистку очередей и базы данных...');

    // Сначала очищаем очереди
    await clearAllQueues();

    // Затем сбрасываем статусы в БД
    await resetStuckGenerations();

    Logger.info('🎊 Полная очистка завершена успешно!');
  } catch (error) {
    Logger.error('💥 Ошибка при полной очистке:', error);
    throw error;
  }
}

/**
 * Получает статистику по всем очередям
 */
export async function getQueuesStats(): Promise<Record<string, any>> {
  const redisConfig = getRedisConfig();
  if (!redisConfig) {
    return { error: 'Redis не настроен' };
  }

  const queueNames = ['image-effect-generation', 'video-generation', 'upgrade-generation'];
  const stats: Record<string, any> = {};

  for (const queueName of queueNames) {
    try {
      const queue = new Queue(queueName, { connection: redisConfig });

      const waiting = await queue.getWaiting();
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();
      const delayed = await queue.getDelayed();

      stats[queueName] = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        total: waiting.length + active.length + completed.length + failed.length + delayed.length,
      };

      await queue.close();
    } catch (error) {
      stats[queueName] = { error: error.message };
    }
  }

  // Добавляем статистику из БД
  try {
    const dbStats = await prisma.generation.groupBy({
      by: ['status'],
      _count: {
        status: true,
      },
    });

    stats.database = dbStats.reduce(
      (acc, stat) => {
        acc[stat.status] = stat._count.status;
        return acc;
      },
      {} as Record<string, number>
    );
  } catch (error) {
    stats.database = { error: error.message };
  }

  return stats;
}

/**
 * Очищает зависшие задачи (старше указанного времени)
 * @param maxAgeMinutes - Максимальный возраст задач в минутах (по умолчанию 30 минут)
 */
export async function cleanStuckTasks(maxAgeMinutes: number = 30): Promise<void> {
  try {
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    Logger.info(
      `🕐 Очистка зависших задач старше ${maxAgeMinutes} минут (до ${cutoffTime.toISOString()})`
    );

    // Находим зависшие задачи в БД
    const stuckGenerations = await prisma.generation.findMany({
      where: {
        status: {
          in: [GenerationStatus.PENDING, GenerationStatus.PROCESSING],
        },
        createdAt: {
          lt: cutoffTime,
        },
      },
      select: {
        id: true,
        userId: true,
        status: true,
        createdAt: true,
      },
    });

    if (stuckGenerations.length === 0) {
      Logger.info('✅ Зависших задач не найдено');
      return;
    }

    Logger.info(`🔍 Найдено ${stuckGenerations.length} зависших задач`, {
      cutoffTime: cutoffTime.toISOString(),
      taskIds: stuckGenerations.map(g => g.id),
    });

    // Обновляем статусы зависших задач
    const updateResult = await prisma.generation.updateMany({
      where: {
        id: {
          in: stuckGenerations.map(g => g.id),
        },
      },
      data: {
        status: GenerationStatus.FAILED,
        error: `Автоматически сброшено: задача зависла более ${maxAgeMinutes} минут`,
      },
    });

    Logger.info(`✅ Автоматически сброшено ${updateResult.count} зависших задач`);

    // Логируем статистику по пользователям
    const userCounts = stuckGenerations.reduce(
      (acc, gen) => {
        acc[gen.userId] = (acc[gen.userId] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    if (Object.keys(userCounts).length > 0) {
      Logger.info('👥 Затронутые пользователи:', userCounts);
    }

    // Очищаем соответствующие задачи из Redis очередей
    await cleanOldRedisJobs(maxAgeMinutes);
  } catch (error) {
    Logger.error('❌ Ошибка при автоматической очистке зависших задач:', error);
    throw error;
  }
}

/**
 * Очищает старые задачи из Redis очередей
 * @param maxAgeMinutes - Максимальный возраст задач в минутах
 */
async function cleanOldRedisJobs(maxAgeMinutes: number): Promise<void> {
  const redisConfig = getRedisConfig();
  if (!redisConfig) {
    Logger.warn('Redis не настроен, пропускаем очистку Redis очередей');
    return;
  }

  const queueNames = ['image-effect-generation', 'video-generation', 'upgrade-generation'];
  const cutoffTimestamp = Date.now() - maxAgeMinutes * 60 * 1000;

  for (const queueName of queueNames) {
    try {
      const queue = new Queue(queueName, { connection: redisConfig });

      // Очищаем старые задачи (задачи созданные до cutoffTimestamp)
      const cleanedCount = await queue.clean(cutoffTimestamp, 100, 'wait');
      const cleanedActiveCount = await queue.clean(cutoffTimestamp, 100, 'active');
      const cleanedFailedCount = await queue.clean(cutoffTimestamp, 100, 'failed');

      if (
        cleanedCount.length > 0 ||
        cleanedActiveCount.length > 0 ||
        cleanedFailedCount.length > 0
      ) {
        Logger.info(`🧹 Очищено задач из очереди ${queueName}:`, {
          waiting: cleanedCount.length,
          active: cleanedActiveCount.length,
          failed: cleanedFailedCount.length,
        });
      }

      await queue.close();
    } catch (error) {
      Logger.error(`❌ Ошибка при очистке Redis очереди ${queueName}:`, error);
    }
  }
}

/**
 * Запускает автоматическую очистку зависших задач с заданным интервалом
 * @param intervalMinutes - Интервал запуска в минутах (по умолчанию 15 минут)
 * @param maxAgeMinutes - Максимальный возраст задач для очистки (по умолчанию 30 минут)
 */
export function startAutoCleanup(
  intervalMinutes: number = 15,
  maxAgeMinutes: number = 30
): NodeJS.Timeout {
  Logger.info(`🚀 Запуск автоматической очистки зависших задач`, {
    intervalMinutes,
    maxAgeMinutes,
    nextRun: new Date(Date.now() + intervalMinutes * 60 * 1000).toISOString(),
  });

  const interval = setInterval(
    async () => {
      try {
        Logger.info('⏰ Запуск периодической очистки зависших задач...');
        await cleanStuckTasks(maxAgeMinutes);
      } catch (error) {
        Logger.error('💥 Ошибка в автоматической очистке:', error);
      }
    },
    intervalMinutes * 60 * 1000
  );

  return interval;
}

/**
 * Останавливает автоматическую очистку
 * @param interval - Интервал для остановки
 */
export function stopAutoCleanup(interval: NodeJS.Timeout): void {
  clearInterval(interval);
  Logger.info('⏹️ Автоматическая очистка остановлена');
}
