import fs from 'fs';
import path from 'path';
import config from '../config';
import cron from 'node-cron';
import { checkExpiredSubscriptions } from './expired-subscription';
import { cleanupPendingPayments } from './payment';
import { Logger } from '../utils/rollbar.logger';
import { cleanStuckTasks } from '../utils/queue-cleanup';

/**
 * Delete a specific image file
 * @param filePath Path to the image file
 * @returns Promise that resolves when the file is deleted or rejected if an error occurs
 */
export async function deleteImageFile(filePath: string): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (error) {
    Logger.error(error, {
      context: 'file-cleanup',
      action: 'delete-file',
      filePath,
    });
    throw error;
  }
}

/**
 * Delete all files in a directory
 * @param directoryPath Path to the directory
 * @param deleteDirectory Whether to delete the directory itself after clearing it
 */
export async function clearDirectory(directoryPath: string, deleteDirectory = true): Promise<void> {
  try {
    if (!fs.existsSync(directoryPath)) {
      return;
    }

    const files = await fs.promises.readdir(directoryPath);

    // Delete all files in the directory
    for (const file of files) {
      const filePath = path.join(directoryPath, file);
      const stat = await fs.promises.stat(filePath);

      if (stat.isDirectory()) {
        // Recursively delete subdirectories
        await clearDirectory(filePath, true);
      } else {
        // Delete file
        await fs.promises.unlink(filePath);
      }
    }

    // Delete the directory itself if requested
    if (deleteDirectory) {
      await fs.promises.rmdir(directoryPath);
    }
  } catch (error) {
    Logger.error(error, {
      context: 'directory-cleanup',
      directoryPath,
      deleteDirectory,
    });
    throw error;
  }
}

/**
 * Cleanup function that removes all files older than a certain age
 * @param olderThanMs Delete files older than this many milliseconds
 */
export async function cleanupOldFiles(olderThanMs = 3600000): Promise<void> {
  try {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    console.log(uploadsDir);
    if (!fs.existsSync(uploadsDir)) {
      return;
    }

    const currentTime = Date.now();
    const dirs = await fs.promises.readdir(uploadsDir);

    for (const dir of dirs) {
      const dirPath = path.join(uploadsDir, dir);
      const stat = await fs.promises.stat(dirPath);

      // Skip if not a directory
      if (!stat.isDirectory()) {
        continue;
      }

      // Check if the directory is a timestamp directory and if it's older than the threshold
      const dirCreateTime = stat.birthtime.getTime();
      if (currentTime - dirCreateTime > olderThanMs) {
        // Directory is old enough to be cleaned up
        await clearDirectory(dirPath, true);
      }
    }
  } catch (error) {
    Logger.error(error, {
      context: 'files-cleanup',
      olderThanMs,
    });
  }
}

/**
 * Check for expired subscriptions
 */
async function checkSubscriptions(): Promise<void> {
  try {
    const count = await checkExpiredSubscriptions();
  } catch (error) {
    Logger.error(error, {
      context: 'subscription-check',
    });
  }
}

/**
 * Cleanup pending payments
 */
export async function cleanupPayments(): Promise<void> {
  try {
    const count = await cleanupPendingPayments();
  } catch (error) {
    Logger.error(error, {
      context: 'payment-cleanup',
    });
  }
}

/**
 * Setup periodic cleanup tasks using node-cron
 * This function should be called on application startup
 * @returns The scheduled cron job
 */
export function setupCleanupTask(): cron.ScheduledTask {
  // Run every hour: file cleanup, subscription check, and stuck tasks cleanup
  const cronJob = cron.schedule('0 * * * *', async () => {
    Logger.info('🕐 Запуск периодических задач очистки...');

    // Clean up old image files
    await cleanupOldFiles(3600000).catch(error => {
      Logger.error(error, {
        context: 'scheduled-cleanup',
        task: 'file-cleanup',
      });
    });

    // Check for expired subscriptions
    await checkSubscriptions().catch(error => {
      console.error('Scheduled subscription check failed:', error);
    });

    // Clean up stale pending payments
    await cleanupPayments().catch(error => {
      Logger.error(error, {
        context: 'scheduled-cleanup',
        task: 'payment-cleanup',
      });
    });

    // Clean up stuck tasks (older than 30 minutes)
    await cleanStuckTasks(30).catch(error => {
      Logger.error(error, {
        context: 'scheduled-cleanup',
        task: 'stuck-tasks-cleanup',
      });
    });

    Logger.info('✅ Периодические задачи очистки завершены');
  });

  return cronJob;
}

/**
 * Run all cleanup tasks manually
 * This is useful for on-demand cleanup or testing
 */
export async function runAllCleanupTasks(): Promise<void> {
  try {
    Logger.info('🚀 Запуск всех задач очистки вручную...');

    // Run all cleanup tasks in parallel for efficiency
    const results = await Promise.allSettled([
      cleanupOldFiles(3600000),
      checkSubscriptions(),
      cleanupPayments(),
      cleanStuckTasks(30), // Очистка зависших задач старше 30 минут
    ]);

    // Log results
    results.forEach((result, index) => {
      const taskNames = [
        'file-cleanup',
        'subscription-check',
        'payment-cleanup',
        'stuck-tasks-cleanup',
      ];
      if (result.status === 'rejected') {
        Logger.error(`❌ Задача ${taskNames[index]} провалилась:`, result.reason);
      } else {
        Logger.info(`✅ Задача ${taskNames[index]} выполнена успешно`);
      }
    });

    Logger.info('🎉 Все задачи очистки завершены');
  } catch (error) {
    Logger.error(error, { context: 'manual-cleanup' });
  }
}
