import { Composer, Markup, Scenes } from 'telegraf';
import {
  getOrCreateUserSettings,
  updateUserSettings,
  getResolutionDimensions,
  createSettingsKeyboard,
  createResolutionKeyboard,
  createLanguageKeyboard,
  formatSettingsInfo
} from '../../services/settings';
import { MyContext } from '../types';
import { prisma } from '../../utils/prisma';
import { SettingsWizardState } from '../../types/bot';
import { Resolution } from '../../types/bot';
import { Language } from '@prisma/client';
import { Logger } from '../../utils/rollbar.logger';

// Create the settings scene
export const settingsScene = new Scenes.WizardScene<MyContext>(
  'settings',
  // Step 1: Main menu - immediately show settings without waiting for input
  async (ctx) => {
    
    const state = await initializeSettingsData(ctx);
    if (!state) {
      Logger.warn('Failed to initialize settings state', {
        telegramId: ctx.from?.id,
        chatId: ctx.chat?.id
      });
      return ctx.scene.leave();
    }
    
    Object.assign(ctx.wizard.state, state);
    
    // Force immediate menu display
    return handleMainSettingsMenu(ctx, state);
  },
  // Step 2: Handle option selection
  handleSettingsOption,
  // Step 3: Handle submenus (resolution, language)
  new Composer<MyContext>()
    .action('square', ctx => handleResolutionChange(ctx, 'SQUARE'))
    .action('vertical', ctx => handleResolutionChange(ctx, 'VERTICAL'))
    .action('horizontal', ctx => handleResolutionChange(ctx, 'HORIZONTAL'))
    .action(/lang_(EN|RU)/, handleLanguageChange)
);

// Global command handlers to exit scene
settingsScene.command(['cancel', 'start', 'help', 'generate', 'balance', 'referral', 'settings'], async (ctx) => {
  const cmd = ctx.message.text.split(' ')[0].substring(1);
  if (cmd === 'cancel') {
    await ctx.reply(ctx.i18n.t('bot:settings.cancelled'));
    await ctx.scene.leave();
    return;
  }
  
  // Complete reset of scene context
  await ctx.scene.leave();
  
  // Ensure context is refreshed before entering new scene
  return ctx.scene.enter(cmd);
});

// Also handle text messages that might be commands
settingsScene.hears(/^\/[a-z]+/, async (ctx) => {
  console.log(`Exiting settings scene due to command ${ctx.message.text}`);
  return ctx.scene.leave();
});

// Handle main keyboard button clicks


// Initialize user data
async function initializeSettingsData(ctx: MyContext): Promise<SettingsWizardState | null> {
  const telegramId = ctx.from?.id.toString() || '';
  
  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { settings: true }
  });
  
  if (!user) {
    await ctx.reply(ctx.i18n.t('bot:errors.not_registered'));
    return null;
  }
  
  // Return the state without creating any new objects
  return { 
    settingsData: {
      userId: user.id,
      telegramId
    }
  };
}

// Main settings menu
async function handleMainSettingsMenu(ctx: MyContext, state: SettingsWizardState) {
  // Get user settings from database - this is the only DB call we need
  const settings = await getOrCreateUserSettings(state.settingsData.userId);
  
  // Get dimensions using the resolution from settings
  const dimensions = getResolutionDimensions(settings.resolution);
  
  // Update i18n locale if needed
  if (settings.language && ctx.i18n && ctx.i18n.locale !== settings.language.toLowerCase()) {
    ctx.i18n.locale = settings.language.toLowerCase();
  }
  
  // Format settings info and send reply
  await ctx.reply(
    formatSettingsInfo(ctx.i18n.locale, settings, dimensions),
    {
      parse_mode: 'HTML',
      reply_markup: createSettingsKeyboard(ctx.i18n.locale).reply_markup,
    }
  );
  
  return ctx.wizard.next();
}

// Handle option selection
async function handleSettingsOption(ctx: MyContext): Promise<any> {
  // Only process callback queries, our main keyboard handler will take care of text messages
  if (!ctx.callbackQuery) {
    return; // Let other handlers (including our global keyboard handler) process this
  }
  
  const callbackData = (ctx.callbackQuery as any).data;
  
  await ctx.answerCbQuery();
  
  const state = getWizardState(ctx);
  if (!state) return exitWithError(ctx);
  
  switch (callbackData) {
    case 'change_resolution':
      return handleChangeResolution(ctx);
    case 'change_language':
      return handleChangeLanguage(ctx);
    default:
      Logger.error(`Unknown action in settings`, { 
        action: callbackData,
        userId: ctx.from?.id 
      });
      return exitWithError(ctx);
  }
}

// Resolution change
async function handleResolutionChange(ctx: MyContext, resolution: Resolution) {
  if (!ctx.callbackQuery) return exitWithError(ctx);
  
  await ctx.answerCbQuery();
  const state = getWizardState(ctx);
  if (!state) return exitWithError(ctx);
  

  // Update settings in database
  await updateUserSettings(state.settingsData.userId, { resolution });
  
  // Send confirmation message
  await ctx.reply(
    ctx.i18n.t('bot:settings.resolution_updated', {
      resolution: ctx.i18n.t(`bot:settings.resolution_${resolution.toLowerCase()}`),
    }),
    { parse_mode: 'HTML' }
  );
  
  // Get current settings with updated resolution
  
  // Show updated settings menu without leaving the scene
  await ctx.scene.leave();
  return ctx.scene.enter('settings');
}

// Language change
async function handleLanguageChange(ctx: MyContext & { match?: RegExpExecArray }) {
  if (!ctx.callbackQuery || !ctx.match?.[1]) return exitWithError(ctx);
  
  await ctx.answerCbQuery();
  const state = getWizardState(ctx);
  if (!state) return exitWithError(ctx);
  
  const language = ctx.match[1] as Language;
  const langCode = language.toLowerCase();
  
  // Update database
  await updateUserSettings(state.settingsData.userId, { language });
  
  // Update the i18n locale in current context
  if (ctx.i18n) {
    ctx.i18n.locale = langCode;
  }

  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Send a confirmation in the new language
  await ctx.reply(
    langCode === 'ru' ? 'Язык изменен на Русский' : 'Language changed to English', 
    { parse_mode: 'HTML' }
  );
  
  
  // Show updated settings without scene reentry
  const settings = await getOrCreateUserSettings(state.settingsData.userId);
  const dimensions = getResolutionDimensions(settings.resolution);
  
  await ctx.reply(
    formatSettingsInfo(ctx.i18n.locale, settings, dimensions),
    {
      parse_mode: 'HTML',
      reply_markup: createSettingsKeyboard(ctx.i18n.locale).reply_markup,
    }
  );
}

// Show resolution options
async function handleChangeResolution(ctx: MyContext) {
  await ctx.reply(ctx.i18n.t('bot:settings.choose_resolution'), {
    parse_mode: 'HTML',
    reply_markup: createResolutionKeyboard(ctx.i18n.locale).reply_markup,
  });
  return ctx.wizard.next();
}

// Show language options
async function handleChangeLanguage(ctx: MyContext) {
  await ctx.reply(
    ctx.i18n.t('bot:settings.language_info'), 
    {
      parse_mode: 'HTML',
      reply_markup: createLanguageKeyboard().reply_markup,
    }
  );
  return ctx.wizard.next();
}

// Get wizard state
function getWizardState(ctx: MyContext): SettingsWizardState | null {
  if (!ctx.wizard?.state) return null;
  return ctx.wizard.state as SettingsWizardState;
}

// Exit with error
async function exitWithError(ctx: MyContext) {
  try {
    await ctx.reply(ctx.i18n.t('bot:errors.general'));
  } catch (err) {
    Logger.error(err, {
      context: 'settings-scene-exit',
      userId: ctx.from?.id,
      chatId: ctx.chat?.id
    });
  }
  return ctx.scene.leave();
}

