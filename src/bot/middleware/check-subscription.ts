import { Markup } from 'telegraf';
import { MyContext } from '../types';
import { prisma } from '../../utils/prisma';

export async function checkChannelSubscriptionLogic(
  ctx: MyContext,
  isCallbackCheck = false // Flag to know if this is triggered by the 'Check Subscription' button
): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId) return true; // Cannot check without user ID

  // Get required channels from env
  const requiredChannels = (process.env.REQUIRED_CHANNELS || '').split(',').filter(Boolean);
  if (!requiredChannels.length) return true; // No channels configured

  try {
    // Find the user record
    const user = await prisma.user.findUnique({ where: { telegramId: userId.toString() } });
    if (!user) return true; // Cannot check for non-existent user in DB

    // Check subscription status via Telegram API
    const subscriptionResults = [];

    for (const channelId of requiredChannels) {
      try {
        // Format channel ID correctly for API call
        // For usernames: ensure they start with @
        // For numeric IDs: use as-is
        const normalizedChannelId = channelId.startsWith('@')
          ? channelId
          : /^-?\d+$/.test(channelId)
            ? channelId
            : `@${channelId}`;

        const member = await ctx.telegram.getChatMember(normalizedChannelId, userId);
        const isSubscribed = ['creator', 'administrator', 'member'].includes(member.status);
        subscriptionResults.push({ channelId: normalizedChannelId, isSubscribed });
      } catch (error) {
        // If we can't check subscription status, assume not subscribed
        subscriptionResults.push({ channelId, isSubscribed: true });
      }
    }

    // Determine if user is subscribed to all channels
    const isSubscribedToAll = subscriptionResults.every(result => result.isSubscribed);

    // Logic for granting free generations and updating DB
    if (isSubscribedToAll) {
      // When user is subscribed to all channels
      const needsToUpdateSubscriptionStatus = !user.isSubscribed;
      const needsToGrantFreeGenerations = !user.freeGenerationsGranted;

      if (needsToGrantFreeGenerations) {
        // Grant free generations only once
        await prisma.user.update({
          where: { id: user.id },
          data: {
            isSubscribed: true,
            freeGenerationsGranted: true,
          },
        });
        // Notify user about granted generations
      } else if (needsToUpdateSubscriptionStatus) {
        // Just update subscription status if they were previously unsubscribed
        await prisma.user.update({
          where: { id: user.id },
          data: { isSubscribed: true },
        });
      }

      // If triggered by button, confirm subscription
      if (isCallbackCheck) {
        await ctx.answerCbQuery(ctx.i18n.t('bot:subscription.all_subscribed_short'));
        if (ctx.callbackQuery?.message?.message_id) {
          await ctx.deleteMessage(ctx.callbackQuery.message.message_id).catch(() => {});
        }
      }

      return true; // User is subscribed
    } else {
      // User is not subscribed to all channels
      if (user.isSubscribed) {
        // Update DB if they were previously marked as subscribed
        await prisma.user.update({
          where: { id: user.id },
          data: { isSubscribed: false },
        });
      }

      // Create channel buttons with proper formatting for display
      const channelButtons = requiredChannels.map(channelId => {
        // Extract username for the button display and URL
        const username = channelId.startsWith('@') ? channelId.substring(1) : channelId;
        return [Markup.button.url(username, `https://t.me/${username}`)];
      });
      const checkButton = Markup.button.callback(
        ctx.i18n.t('bot:subscription.check_button'),
        'check_subscription'
      );
      const keyboard = [...channelButtons, [checkButton]];

      // Send subscription prompt message
      try {
        // If triggered by button, edit the existing message
        if (isCallbackCheck && ctx.callbackQuery?.message) {
          // Always answer the callback query to provide feedback
          await ctx.answerCbQuery(ctx.i18n.t('bot:subscription.check_again_short'));
        } else if (!isCallbackCheck) {
          // Otherwise, send a new message
          await ctx.reply(
            ctx.i18n.t('bot:subscription.not_subscribed'),
            Markup.inlineKeyboard(keyboard)
          );
        }
      } catch (error) {
        console.error('Error sending subscription message:', error);
        return true; // Allow functionality even if prompt fails
      }
      return false; // User needs to subscribe
    }
  } catch (error) {
    console.error('Unexpected error in subscription check:', error);
    return true; // Allow functionality on unexpected errors
  }
}

// Middleware to check channel subscriptions
export async function checkChannelSubscription(ctx: MyContext, next: () => Promise<void>) {
  // Skip check if feature is disabled
  const isCheckActive = process.env.SUBSCRIPTION_CHECK_ACTIVE === 'true';
  if (!isCheckActive) return next();

  // Skip check for specific commands like /start
  if (ctx.message && 'text' in ctx.message && ['/start'].includes(ctx.message.text.split(' ')[0])) {
    return next();
  }

  // Handle the check_subscription callback query specifically
  if (
    ctx.callbackQuery &&
    'data' in ctx.callbackQuery &&
    ctx.callbackQuery.data === 'check_subscription'
  ) {
    try {
      // First answer the callback query to prevent the spinner
      await ctx.answerCbQuery(undefined, { cache_time: 0 });

      // Then check the subscription status with isCallbackCheck=true
      await checkChannelSubscriptionLogic(ctx, true);
    } catch (error) {
      console.error('Error handling check_subscription callback:', error);

      // Try to give feedback to the user
      try {
        await ctx.answerCbQuery(
          ctx.i18n.t('bot:subscription.error_checking') || 'Error checking subscription status'
        );
      } catch (answerError) {
        console.error('Failed to answer callback query:', answerError);
      }
    }
    return; // Don't call next() because we handled the action
  }

  // Always check subscription status on each command or action
  try {
    const isSubscribed = await checkChannelSubscriptionLogic(ctx, false);
    if (!isSubscribed) {
      // Stop processing if user is not subscribed and needs to be prompted
      return;
    }
    // If subscribed, continue to the next middleware/handler
    return next();
  } catch (error) {
    console.error('Error in subscription check middleware:', error);
    // Allow functionality even if the check fails unexpectedly
    return next();
  }
}
