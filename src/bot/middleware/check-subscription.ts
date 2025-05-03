import { Markup } from "telegraf";
import { MyContext } from "../types";

export async function checkChannelSubscriptionLogic(ctx: MyContext, isSendMessage = false): Promise<boolean> {
    try {
      // Get required channels from env
      const requiredChannels = (process.env.REQUIRED_CHANNELS || '').split(',').filter(Boolean);
      
      if (!requiredChannels.length) {
        // No channels to check, assume subscribed
        return true;
      }
      
      const userId = ctx.from?.id;
      if (!userId) {
        return ctx.scene.current ? ctx.scene.enter(ctx.scene.current.id) : null;
      }
      
      // Check subscription status for each channel
      const subscriptionPromises = requiredChannels.map(async channelId => {
        try {
          const member = await ctx.telegram.getChatMember(channelId, userId);
          return ['creator', 'administrator', 'member'].includes(member.status);
        } catch (error) {
          console.error(`Error checking subscription for channel ${channelId}:`, error);
          return true; // Assume subscribed on error to avoid blocking users
        }
      });
      
      const subscriptionStatuses = await Promise.all(subscriptionPromises);
      const isSubscribedToAll = subscriptionStatuses.every(status => status);
      
      if (isSubscribedToAll) {
        // User is subscribed to all channels, show success message
        if (isSendMessage) {
          try {
            await ctx.reply(ctx.i18n.t('bot:subscription.all_subscribed'));
          } catch (error) {
            console.error('Error sending subscription success message:', error);
            // Continue even if the message can't be sent
          }
        }
        return true;
      } else {
        // Create channel buttons
        const channelButtons = requiredChannels.map(channelId => {
          // Extract username for display
          const username = channelId.startsWith('@') ? channelId.substring(1) : channelId;
          return [Markup.button.url(username, `https://t.me/${username}`)];
        });

        // Add check button
        const checkButton = Markup.button.callback(
          ctx.i18n.t('bot:subscription.check_button'), 
          'check_subscription'
        )

        // Create proper keyboard structure
        const keyboard = [...channelButtons, [checkButton]];

        // Send subscription message - safely
        try {
          await ctx.reply(
            ctx.i18n.t('bot:subscription.not_subscribed'),
            Markup.inlineKeyboard(keyboard)
          );
        } catch (error) {
          // Handle errors like user blocking the bot
          if (error.message && error.message.includes('blocked by the user')) {
            console.warn(`User ${userId} has blocked the bot, skipping subscription check`);
          } else {
            console.error('Error sending subscription message:', error);
          }
          // Return true to avoid blocking functionality
          return true;
        }
      }
      
    } catch (error) {
      // Enhance error logging with more details but prevent failures from breaking the bot
      console.error('Error in check_subscription handler:', error);
      // Always return true on error to keep the bot running
      return true;
    }
    
    // If we reach here, subscription checks were attempted but user needs to subscribe
    return false;
}


// Middleware to check channel subscriptions
export async function checkChannelSubscription(ctx: MyContext, next: () => Promise<void>) {
  try {
    // Skip check for specific commands like start
    if (ctx.message && 'text' in ctx.message && ['/start', '/check_subscription'].includes(ctx.message.text.split(' ')[0])) {
      return next();
    }
    
    // Skip check in callbacks that already have their own logic
    if (ctx.callbackQuery && 'data' in ctx.callbackQuery && ctx.callbackQuery.data === 'check_subscription') {
      return next();
    }

    const isCheckActive = process.env.SUBSCRIPTION_CHECK_ACTIVE === 'true';
    if (!isCheckActive) {
      return next();
    }

    // Check subscription status
    const isSubscribed = await checkChannelSubscriptionLogic(ctx);
    if (!isSubscribed) {
      return;
    }
    return next();
  } catch (error) {
    console.error('Error in checkChannelSubscription middleware:', error);
    // Always continue to next middleware even if there's an error
    return next();
  }
}

// Add middleware to bot (before stage middleware)


