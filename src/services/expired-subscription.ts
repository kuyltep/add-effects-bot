import { User } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { bot } from '../bot/core';

/**
 * Check for expired subscriptions and update their status
 * @returns Number of expired subscriptions processed
 */
export async function checkExpiredSubscriptions(): Promise<number> {
  try {
    const now = new Date();

    // Find all active subscriptions that have expired
    const expiredSubscriptions = await prisma.user.findMany({
      where: {
        subscriptionActive: true,
        subscriptionEndDate: {
          lt: now,
        },
      },
    });

    console.log(`Found ${expiredSubscriptions.length} expired subscriptions to process`);

    // Update each expired subscription and notify users
    const updatePromises = expiredSubscriptions.map(user => processExpiredSubscription(user));
    const results = await Promise.allSettled(updatePromises);

    // Count successful updates
    const successCount = results.filter(result => result.status === 'fulfilled').length;
    console.log(`Successfully processed ${successCount} expired subscriptions`);

    return successCount;
  } catch (error) {
    console.error('Error checking expired subscriptions:', error);
    return 0;
  }
}

/**
 * Process an individual expired subscription
 * @param user User with expired subscription
 */
async function processExpiredSubscription(user: User): Promise<void> {
  try {
    // Update user's subscription status
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionActive: false,
      },
    });

    console.log(`Deactivated subscription for user: ${user.id}`);

    // Notify user if they have a Telegram chat ID
    if (user.telegramChatId) {
      try {
        await notifyUserOfExpiration(user);
      } catch (notifyError) {
        console.error(
          `Failed to notify user ${user.id} about subscription expiration:`,
          notifyError
        );
      }
    }
  } catch (error) {
    console.error(`Error processing expired subscription for user ${user.id}:`, error);
    throw error;
  }
}

/**
 * Send notification to user about their expired subscription
 * @param user User to notify
 */
async function notifyUserOfExpiration(user: User): Promise<void> {
  if (!user.telegramChatId) return;

  try {
    // Get user's language preference
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    const language = userSettings?.language || 'EN';
    const messageKey =
      language === 'RU' ? 'bot:subscription.expired_ru' : 'bot:subscription.expired_en';

    const message =
      language === 'RU'
        ? `❗ <b>Ваша подписка истекла</b>\n\nВаша подписка закончилась. Теперь вы можете использовать только оставшиеся генерации (${user.remainingGenerations}).\n\nЧтобы продолжить неограниченную генерацию изображений, обновите подписку с помощью команды /subscription.`
        : `❗ <b>Your subscription has expired</b>\n\nYour subscription has ended. You can now only use your remaining generations (${user.remainingGenerations}).\n\nTo continue unlimited image generation, renew your subscription using the /subscription command.`;

    // Send notification via bot
    await bot.telegram.sendMessage(user.telegramChatId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '🔄 Renew Subscription', callback_data: 'subscribe' }]],
      },
    });

    console.log(`Sent subscription expiration notification to user ${user.id}`);
  } catch (error) {
    console.error(`Error sending expiration notification to user ${user.id}:`, error);
    throw error;
  }
}

/**
 * Cancel a user's subscription
 * @param userId User ID
 * @returns Updated user
 */
export async function cancelSubscription(userId: string): Promise<User> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.subscriptionActive) {
      throw new Error('User has no active subscription');
    }

    // Update user to remove subscription
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionActive: false,
      },
    });

    console.log(`Cancelled subscription for user ${userId}`);
    return updatedUser;
  } catch (error) {
    console.error(`Error cancelling subscription for user ${userId}:`, error);
    throw error;
  }
}
