import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { paymentConfig, packagesConfig } from '../config';
import { User } from '@prisma/client';
import { createRedisPublisher } from '../utils/redis';

/**
 * Available generation packages
 */
export const GENERATION_PACKAGES = packagesConfig;

/**
 * Package types
 */
export type GenerationPackageType = keyof typeof GENERATION_PACKAGES;

export async function addGenerationsToUser(userId: string, count: number): Promise<User> {
  try {
    // Update user's generation count
    const user = await prisma.user.update({
      where: { 
        telegramId: userId },
      data: {
        remainingGenerations: {
          increment: count,
        },
      },
    });

    console.log(`Added ${count} generations to user ${userId}`);
    return user;
  } catch (error) {
    console.error('Error adding generations to user:', error, { userId });
    throw error;
  }
}

/**
 * Clean up pending payments older than the specified time
 * @param olderThanMs Time in milliseconds (default: 1 hour)
 * @returns Number of removed payments
 */
export async function cleanupPendingPayments(olderThanMs = 3600000): Promise<number> {
  try {
    // Validate input
    if (olderThanMs <= 0) {
      console.warn('Invalid cleanup time specified, using default 1 hour', {
        context: 'payment-service',
        method: 'cleanupPendingPayments',
      });
      olderThanMs = 3600000;
    }

    // Calculate the cutoff date
    const cutoffDate = new Date(Date.now() - olderThanMs);

    // First count how many will be affected (for logging)

    // Delete pending payments older than the cutoff date
    const result = await prisma.payment.deleteMany({
      where: {
        status: 'pending',
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    // Log with additional details for monitoring
    return result.count;
  } catch (error) {
    // Enhanced error logging with more details
    console.error(error, {
      context: 'payment-service',
      method: 'cleanupPendingPayments',
      timestamp: new Date().toISOString(),
    });
    return 0;
  }
}

/**
 * Send payment success notification via Redis
 * @param data Payment success notification data
 */
export async function sendPaymentSuccessNotification(data: {
  userId: string;
  telegramId: string;
  generationsAdded: number;
  amount: number;
}): Promise<void> {
  try {
    const redisPublisher = createRedisPublisher();

    await redisPublisher.publish('bot:payment_success', JSON.stringify(data));

    await redisPublisher.quit();
  } catch (error) {
    console.error(error, {
      context: 'payment-service',
      method: 'sendPaymentSuccessNotification',
      userId: data.userId,
    });
  }
}
