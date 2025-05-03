import { SceneName } from '../types/bot/wizard.interface';
import { TransitionDirection } from '../types/bot/scene.type';
import { MyContext, GenerateWizardState } from '../types';
import { findUserByTelegramId } from './user';
import { getOrCreateUserSettings, getResolutionDimensions } from './settings';
import { detectLanguage } from '../bot/middleware/i18n';
import { SceneType } from '../types/bot/scene.type';
import { Logger } from '../utils/rollbar.logger';

/**
 * Handles scene transition with proper error handling
 * @param ctx The Telegraf context
 * @param sceneName The target scene name
 * @param state Optional state to pass to the new scene
 * @returns A promise resolving when transition is complete
 */
export async function transitionToScene(
  ctx: MyContext, 
  sceneName: SceneName | SceneType,
  state?: Record<string, any>
): Promise<void> {
  try {
    // Answer callback query if exists to prevent hanging UI
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery().catch(err => Logger.error(err, { context: 'transitionToScene', method: 'answerCbQuery' }));
    }
    
    await ctx.scene.leave();
    await ctx.scene.enter(sceneName, state);
  } catch (error) {
    Logger.error(error, { context: 'transitionToScene', sceneName });
    await ctx.reply(ctx.i18n.t('bot:errors.general'));
  }
}

/**
 * Transitions between wizard steps
 * @param ctx The Telegraf context
 * @param direction Direction to move (next, previous, exit)
 */
export async function transitionWizardStep(
  ctx: MyContext, 
  direction: TransitionDirection
): Promise<void> {
  try {
    switch (direction) {
      case 'next':
        ctx.wizard.next();
        break;
      case 'previous':
        // If supporting previous functionality
        // would need to implement step back logic
        ctx.wizard.selectStep(ctx.wizard.cursor - 1);
        break;
      case 'exit':
        await ctx.reply(ctx.i18n.t('bot:generate.cancelled'));
        await ctx.scene.leave();
        break;
    }
  } catch (error) {
    Logger.error(error, { context: 'transitionWizardStep', direction });
    await ctx.reply(ctx.i18n.t('bot:errors.general'));
    await ctx.scene.leave();
  }
}

/**
 * Initializes wizard state with user data and settings
 * @param ctx The Telegraf context
 * @param telegramId The user's Telegram ID
 * @returns Promise resolving to wizard state or null if initialization failed
 */
export async function initializeWizardState(
  ctx: MyContext, 
  telegramId: string
): Promise<GenerateWizardState | null> {
  try {
    // Get user data with a single query
    const user = await findUserByTelegramId(telegramId);

    if (!user) {
      await ctx.reply(ctx.i18n.t('bot:errors.not_registered'));
      return null;
    }

    // Get user settings with a single query
    const settings = await getOrCreateUserSettings(user.id);
    
    // Get dimensions calculated once
    const dimensions = getResolutionDimensions(settings.resolution);

    // Get user language for localization
    const language = await detectLanguage(ctx);

    // Build wizard state object with all needed data
    const generationData = {
      userId: user.id,
      telegramId,
      prompt: '',
      negativePrompt: '',
      referralCode: user.referralCode,
      remainingGenerations: user.remainingGenerations,
      subscriptionActive: user.subscriptionActive,
      seed: settings.useSeed ? 0 : -1, // Use random seed by default
      width: dimensions.width,
      height: dimensions.height,
      batchSize: settings.batchSize,
      model: settings.model || undefined,
      language,
    };

    // Create and return state
    const state = {
      userData: { ...user },
      userSettings: {
        ...settings,
        model: settings.model || undefined,
      },
      generationData
    };
    
    // Update wizard state
    Object.assign(ctx.wizard.state, state);
    return state;
  } catch (error) {
    Logger.error(error, { 
      context: 'initializeWizardState', 
      telegramId 
    });
    throw error;
  }
}

/**
 * Exits scene with specified message
 */
export async function exitScene(
  ctx: MyContext, 
  messageKey: string = 'errors.cancelled'
): Promise<any> {
  // await ctx.reply(ctx.i18n.t(messageKey));
  return await ctx.scene.leave();
}

/**
 * Checks if the callback query data matches the expected pattern
 */
export function checkCallbackData(
  ctx: MyContext,
  pattern: RegExp
): RegExpMatchArray | null {
  if (!ctx.callbackQuery) {
    return null;
  }
  
  const data = (ctx.callbackQuery as any).data;
  if (!data) {
    return null;
  }
  
  return data.match(pattern);
}

/**
 * Gets the start command parameter
 */
export function getStartParameter(ctx: MyContext): string | undefined {
  if (!ctx.message || !('text' in ctx.message)) {
    return undefined;
  }
  
  const messageText = ctx.message.text;
  const match = messageText.match(/^\/start\s+p_([a-zA-Z0-9]+)$/);
  
  return match && match[1] ? match[1].trim() : undefined;
}

/**
 * Creates a referral link for a user
 */
export function createReferralLink(botUsername: string, referralCode: string): string {
  return `https://t.me/${botUsername}?start=p_${referralCode}`;
} 


/**
 * Handles error in scene and exits gracefully
 */
export async function handleSceneError(
  ctx: MyContext, 
  error: unknown, 
  sceneName: string
): Promise<any> {
  Logger.error(error instanceof Error ? error : new Error(String(error)), { 
    context: 'scene-error', 
    sceneName 
  });
  
  await ctx.reply(ctx.i18n.t('bot:errors.general'), {
    parse_mode: 'HTML',
  });
  return ctx.scene.leave();
}
