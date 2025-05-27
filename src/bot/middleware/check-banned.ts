import { prisma } from '../../utils/prisma';

// Middleware to check if user is banned
export async function checkBannedUser(ctx: any, next: () => Promise<void>) {
  try {
    // Skip middleware for specific commands like /start
    const message = ctx.message || ctx.callbackQuery?.message;
    const command = message?.text;

    // Always allow /start command even for banned users
    if (command === '/start') {
      return next();
    }

    const userId = ctx.from?.id?.toString();
    if (!userId) {
      return next();
    }

    // Check if user exists and is banned
    const user = await prisma.user.findUnique({
      where: { telegramId: userId },
      select: { isBanned: true, banReason: true },
    });

    // If user is banned, send message and don't proceed
    if (user?.isBanned) {
      await ctx.reply(
        ctx.i18n.t('bot:errors.user_banned', { reason: user.banReason || 'No reason provided' })
      );
      return;
    }

    // Continue processing if user is not banned
    return next();
  } catch (error) {
    return next();
  }
}
