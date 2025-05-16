import { Scenes, Markup } from 'telegraf';
import { findUserByTelegramId } from '../../services/user';
import { prisma } from '../../utils/prisma';
import { MyContext } from '../types';
import { getMainKeyboard } from '../keyboards';
import { handleSceneError, exitScene, createReferralLink } from '../../services/scene';

// Create the referral scene
export const referralScene = new Scenes.BaseScene<MyContext>('referral');

/**
 * Fetches user data and referral count
 */
async function fetchUserReferralData(telegramId: string): Promise<{
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
 * Displays referral information to the user
 */
async function displayReferralInfo(ctx: MyContext): Promise<any> {
  const telegramId = ctx.from?.id.toString() || '';
  const userData = await fetchUserReferralData(telegramId);

  if (!userData) {
    await ctx.reply(ctx.i18n.t('bot:errors.not_registered'), {
      parse_mode: 'HTML',
    });
    return ctx.scene.leave();
  }

  const { user, referralCount } = userData;

  // Create referral link using helper function
  const botUsername = process.env.BOT_USERNAME; // Store in config for better maintainability
  const referralLink = createReferralLink(botUsername, user.referralCode);

  // Show referral information
  await ctx.reply(
    ctx.i18n.t('bot:referral.info', {
      count: referralCount,
      code: user.referralCode,
      link: referralLink,
      referralBonus: process.env.REFERRAL_BONUS || '1',
    }),
    {
      parse_mode: 'HTML',
      reply_markup: getMainKeyboard(ctx.i18n.locale || 'en').reply_markup,
    }
  );

  // Auto leave the scene after displaying referral info
  return ctx.scene.leave();
}

// Scene enter handler
referralScene.enter(async ctx => {
  try {
    return await displayReferralInfo(ctx);
  } catch (error) {
    return handleSceneError(ctx, error, 'referral');
  }
});

// Handle /cancel command
referralScene.command('cancel', async ctx => {
  return exitScene(ctx, 'bot:errors.cancelled');
});
