import { Context, MiddlewareFn } from 'telegraf';
import { Logger } from '../utils/rollbar.logger';
import { MyContext } from '../types/bot';

/**
 * Global error handler middleware for the Telegram bot
 * Catches all errors in bot handlers and scenes, logs them, and provides a user-friendly message
 */
export const botErrorHandler = (): MiddlewareFn<MyContext> => async (ctx, next) => {
  try {
    // Proceed to the next middleware/handler
    await next();
  } catch (error) {
    // Create context with relevant data for error reporting
    const errorContext = {
      updateType: ctx.updateType,
      chatId: ctx.chat?.id,
      userId: ctx.from?.id,
      username: ctx.from?.username,
      messageText: ('text' in ctx.message) ? ctx.message.text : undefined,
      scene: ctx.scene?.current?.id,
    };
    
    // Log the error to Rollbar with context
    Logger.error(error instanceof Error ? error : new Error(String(error)), errorContext);
    
    // Send a user-friendly message
    try {
      let errorMessage = 'An error occurred while processing your request.';
      
      // Use i18n if available
      if (ctx.i18n) {
        errorMessage = ctx.i18n.t('bot:errors.general');
      }
      
      await ctx.reply(errorMessage, { parse_mode: 'HTML' });
      
      // If in a scene, leave it to avoid stuck states
      if (ctx.scene?.current) {
        await ctx.scene.leave();
      }
    } catch (replyError) {
      // If reply fails, log this additional error
      Logger.error(
        replyError instanceof Error ? replyError : new Error(String(replyError)), 
        { ...errorContext, context: 'Failed to send error message' }
      );
    }
  }
}; 