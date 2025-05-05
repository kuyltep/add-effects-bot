import { Composer, Context, Markup, Scenes } from 'telegraf';
import { 
  MyContext, 
  GenerateWizardState,
  EffectType
} from '../../types';
import { 
  canUserGenerate,
  queueImageGenerationJob
} from '../../services/generation';
import { 
  transitionToScene,
  initializeWizardState,
  handleSceneError,
  exitScene
} from '../../services/scene';
import { Logger } from '../../utils/rollbar.logger';

// STEP HANDLERS
const effectSelectorHandler = new Composer<MyContext>();
const photoHandler = new Composer<MyContext>();

// Define effect types and their corresponding labels for the keyboard
const effectOptions: { key: EffectType; labelKey: string }[] = [
  // OpenAI-processed effects
  { key: 'claymation', labelKey: 'bot:generate.effect_claymation' },
  { key: 'ghibli', labelKey: 'bot:generate.effect_ghibli' },
  { key: 'pixar', labelKey: 'bot:generate.effect_pixar' },
  // FAL AI-processed effects
  { key: 'plushify', labelKey: 'bot:generate.effect_plushify' },
  { key: 'ghiblify', labelKey: 'bot:generate.effect_ghiblify' },
  { key: 'cartoonify', labelKey: 'bot:generate.effect_cartoonify' },
];

// WIZARD STEP TRANSITIONS & HANDLERS

/**
 * Sends the effect selection message and keyboard.
 */
async function showEffectSelection(ctx: MyContext): Promise<void> {
  const buttons = effectOptions.map(option => 
    Markup.button.callback(ctx.i18n.t(option.labelKey), `select_effect_${option.key}`)
  );
  
  // Add Back button
  buttons.push(Markup.button.callback(ctx.i18n.t('common.cancel'), 'cancel_generation'));
  
  // Create a keyboard with 2 columns
  const keyboard = [];
  for (let i = 0; i < buttons.length - 1; i += 2) {
    const row = [buttons[i]];
    if (i + 1 < buttons.length - 1) {
      row.push(buttons[i + 1]);
    }
    keyboard.push(row);
  }
  // Add the cancel button in its own row
  keyboard.push([buttons[buttons.length - 1]]);

  await ctx.reply(ctx.i18n.t('bot:generate.select_effect_prompt'), {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard(keyboard).reply_markup,
  });
}

/**
 * Handles the selection of an effect.
 */
effectSelectorHandler.action(/select_effect_(claymation|ghibli|pixar|plushify|ghiblify|cartoonify)/, async (ctx) => {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as GenerateWizardState;
  const selectedEffect = ctx.match[1] as EffectType;

  if (!state?.generationData) {
    Logger.warn('State missing in effect selection', { userId: ctx.from?.id });
    return exitWithError(ctx, 'bot:errors.general');
  }

  // Store the selected effect
  state.generationData.effect = selectedEffect;

  // Prompt for photo
  try {
     await ctx.editMessageText(ctx.i18n.t('bot:generate.send_photo_for_effect'), {
       parse_mode: 'HTML',
     });
  } catch (error) {
     // If editing fails (e.g., message too old), send a new message
     await ctx.reply(ctx.i18n.t('bot:generate.send_photo_for_effect'), {
       parse_mode: 'HTML',
     });
  }

  // Move to the photo handler step
  return ctx.wizard.next();
});

effectSelectorHandler.action('cancel_generation', async (ctx) => {
  await ctx.answerCbQuery();
  return exitScene(ctx, 'bot:generate.cancelled');
});

/**
 * Handles photo/document input from the user.
 */
async function handlePhotoInput(ctx: MyContext, fileId: string): Promise<void> {
  const state = ctx.wizard.state as GenerateWizardState;
  if (!state?.generationData?.effect || !state?.userData?.id || !state?.userSettings?.resolution) {
    Logger.warn('State missing in photo handler', { userId: ctx.from?.id });
    return exitWithError(ctx, 'bot:errors.general');
  }

  const { effect } = state.generationData;
  const { id: userId, language } = state.userData;
  const { resolution } = state.userSettings;

  try {
    // Send confirmation and queue the job
    const statusMessage = await ctx.reply(ctx.i18n.t('bot:generate.processing_queued'), { parse_mode: 'HTML' });

    await queueImageGenerationJob({
      userId,
      generationId: '', // Will be generated in the service
      fileId: fileId, // Pass file ID from Telegram
      effect,
      chatId: ctx.chat?.id.toString() || '',
      messageId: statusMessage.message_id,
      language: language || ctx.i18n.locale || 'en',
      resolution: resolution
    });

  } catch (error) {
    Logger.error(error, { context: 'queueImageGenerationJob', userId });
    await ctx.reply(ctx.i18n.t('bot:generate.queue_error'));
  }

  // Leave the scene after queuing
  await ctx.scene.leave();
}

// Handler for processing user's photo input
photoHandler.on('photo', async ctx => {
  const photoSizes = ctx.message.photo;
  const largestPhoto = photoSizes[photoSizes.length - 1];
  await handlePhotoInput(ctx, largestPhoto.file_id);
});

// Handle document messages (files)
photoHandler.on('document', async ctx => {
  const { document } = ctx.message;
  if (!document.mime_type?.startsWith('image/')) {
    await ctx.reply(ctx.i18n.t('bot:generate.not_an_image'));
    return; // Stay in this step
  }
  await handlePhotoInput(ctx, document.file_id);
});

// Handle text messages (invalid input in photo step)
photoHandler.on('text', async ctx => {
  if (ctx.message.text === '/cancel') {
    return exitScene(ctx, 'bot:generate.cancelled');
  }
  await ctx.reply(ctx.i18n.t('bot:generate.send_photo_for_effect'));
});

// Handle all other message types in photo step
photoHandler.on('message', async ctx => {
  await ctx.reply(ctx.i18n.t('bot:generate.send_photo_for_effect'));
});

// SCENE DEFINITION
export const generateScene = new Scenes.WizardScene<MyContext>(
  'generate',
  // Step 0: Initial check and effect selection
  async (ctx) => {
    const telegramId = ctx.from?.id.toString() || '';
    const initState = await initializeWizardState(ctx, telegramId);
    if (!initState || !initState.userData) {
      return exitWithError(ctx, 'bot:errors.not_registered'); // Or general error
    }

    const canGenerate = await canUserGenerate(ctx, initState.userData);
    if (!canGenerate) {
      return ctx.scene.leave();
    }
    
    await showEffectSelection(ctx);
    return ctx.wizard.next(); // Move to effect selection handler step
  },
  // Step 1: Handle effect selection callback
  effectSelectorHandler,
  // Step 2: Handle photo input
  photoHandler
);

// Generic error handler for the scene
async function exitWithError(ctx: MyContext, messageKey: string) {
  try {
    await ctx.reply(ctx.i18n.t(messageKey));
  } catch (replyError) {
     Logger.warn(`Failed to send error message ${messageKey}`, { userId: ctx.from?.id, error: replyError });
  }
  return ctx.scene.leave();
}

// Setup general scene behaviors (like cancel)
// generateScene.command('cancel', async (ctx) => exitScene(ctx, 'bot:generate.cancelled'));
// Handle interruptions if needed (already partially handled by command handlers)
// generateScene.use(async (ctx, next) => { ... });