import { Scenes } from 'telegraf';
import { findUserByTelegramId, createUser } from '../../services/user';
import { getMainKeyboard } from '../keyboards';
import { MyContext } from '../../types/bot';
import { processReferralCode } from '../../services/referral';
import { getStartParameter, createReferralLink } from '../../services/scene';
import { TelegramUserInfo } from '../../types/user.type';

/**
 * Extract user information from context
 */
function extractUserInfo(ctx: MyContext): TelegramUserInfo {
  return {
    telegramId: ctx.from?.id.toString() || '',
    username: ctx.from?.username,
    chatId: ctx.chat?.id.toString() || '',
    firstName: ctx.from?.first_name,
    language: ctx.from?.language_code?.startsWith('ru') ? 'RU' : 'EN',
  };
}

/**
 * Handle existing user greeting
 */
async function handleExistingUser(ctx: MyContext, user: any, referralCode?: string): Promise<any> {
  // Greet the returning user
  await ctx.reply(
    ctx.i18n.t('bot:greeting.welcome_back', {
      name: ctx.from?.first_name || '',
      remainingGenerations: user.remainingGenerations,
    }),
    {
      parse_mode: 'HTML',
      reply_markup: getMainKeyboard(ctx.i18n.locale || 'en').reply_markup,
    }
  );

  // Logger.info('User returned to bot', {
  //   userId: user.id,
  //   telegramId: user.telegramId,
  //   hasReferralCode: !!referralCode
  // });

  // Process the referral code if provided and it's not the user's own code
  if (referralCode && referralCode !== user.referralCode) {
    await processReferralCode(referralCode, user.id);
  }

  return ctx.scene.leave();
}

/**
 * Handle new user registration
 */
async function handleNewUser(
  ctx: MyContext,
  userInfo: TelegramUserInfo,
  referralCode?: string
): Promise<any> {
  // Generate a random password for automatic account creation
  const randomPassword = Math.random().toString(36).slice(-8);

  // Create email based on Telegram ID
  const email = `${userInfo.telegramId}@telegram.local`;

  // Detect user's language from Telegram client
  // const language = ctx.from?.language_code?.toLowerCase().startsWith('ru') ? 'RU' : 'EN';
  // Temporarily set default language to Russian for new users
  const language = 'RU';

  // Logger.info('Creating new user', {
  //   telegramId: userInfo.telegramId,
  //   language,
  //   hasReferralCode: !!referralCode
  // });

  // Create user with Telegram data
  const newUser = await createUser(
    email,
    randomPassword,
    userInfo.telegramId,
    userInfo.username,
    userInfo.chatId,
    referralCode,
    language
  );

  // Get bot username for referral link (should be in config)
  const botUsername = process.env.BOT_USERNAME;
  const referralLink = createReferralLink(botUsername, newUser.referralCode);

  // Welcome the new user
  await ctx.reply(
    ctx.i18n.t('bot:greeting.auto_registered', {
      name: userInfo.firstName || '',
      remainingGenerations: newUser.remainingGenerations,
      referralCode: newUser.referralCode,
      referralLink,
    }),
    {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: getMainKeyboard(ctx.i18n.locale || 'en').reply_markup,
    }
  );

  return ctx.scene.leave();
}

/**
 * Main function to handle user starting the bot
 */
async function handleStartCommand(ctx: MyContext): Promise<any> {
  // Extract user information
  const userInfo = extractUserInfo(ctx);

  // Get referral code from start parameter if available
  const referralCode = getStartParameter(ctx);

  // Logger.info('Start command received', {
  //   telegramId: userInfo.telegramId,
  //   hasReferralParam: !!referralCode
  // });

  // Check if user already exists
  const user = await findUserByTelegramId(userInfo.telegramId);

  if (user) {
    return handleExistingUser(ctx, user, referralCode);
  } else {
    return handleNewUser(ctx, userInfo, referralCode);
  }
}

// Create the start scene
export const startScene = new Scenes.WizardScene<MyContext>(
  'start',
  // Initial step - handle start command
  async ctx => {
    return await handleStartCommand(ctx);
  }
);

// No need for cancel command as this is a one-step scene that exits immediately
