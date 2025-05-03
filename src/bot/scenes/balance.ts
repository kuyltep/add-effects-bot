import { Markup, Scenes } from 'telegraf';
import { findUserByTelegramId } from '../../services/user';
import { prisma } from '../../utils/prisma';
import { MyContext } from '../../types/bot';
import { exitScene, transitionToScene } from '../../services/scene';

// Create the balance scene
export const balanceScene = new Scenes.BaseScene<MyContext>('balance');

/**
 * Fetches user data including referral count
 */
async function fetchUserData(telegramId: string): Promise<{
  user: any;
  referralCount: number;
} | null> {
  const user = await findUserByTelegramId(telegramId);
  
  if (!user) {
    return null;
  }
  
  // Get referral count in a single query
  const referralCount = await prisma.referral.count({
    where: { referrerId: user.id },
  });
  
  return { user, referralCount };
}

/**
 * Creates balance scene keyboard
 */
function createBalanceKeyboard(ctx: MyContext): any {
  const buttons = [
    [
      Markup.button.callback(ctx.i18n.t('bot:buttons.invite_friend'), 'invite_friend'),
      Markup.button.callback(ctx.i18n.t('bot:buttons.buy_generations'), 'buy_generations'),
    ],
  ];
  
  return Markup.inlineKeyboard(buttons).reply_markup;
}

/**
 * Displays user balance information
 */
async function displayBalanceInfo(ctx: MyContext): Promise<any> {
  const telegramId = ctx.from?.id.toString() || '';
  const userData = await fetchUserData(telegramId);
  
  if (!userData) {
    await ctx.reply(ctx.i18n.t('bot:errors.not_registered'), {
      parse_mode: 'HTML',
    });
    return ctx.scene.leave();
  }
  
  const { user, referralCount } = userData;
  
  const balanceText = ctx.i18n.t('bot:balance.info', {
    remainingGenerations: user.remainingGenerations,
    referrals: referralCount,
  });
  
  await ctx.reply(
    balanceText,
    {
      parse_mode: 'HTML',
      reply_markup: createBalanceKeyboard(ctx),
    }
  );
  
  // Auto leave the scene after displaying balance
  return ctx.scene.leave();
}

// Scene enter handler
balanceScene.enter(async (ctx) => {
  return await displayBalanceInfo(ctx);
});

// Handle callback actions
balanceScene.action('buy_generations', async (ctx) => {
  await ctx.answerCbQuery();
  return transitionToScene(ctx, 'packages');
});

// Handle /cancel command
balanceScene.command('cancel', async (ctx) => {
  return exitScene(ctx, 'bot:errors.cancelled');
}); 