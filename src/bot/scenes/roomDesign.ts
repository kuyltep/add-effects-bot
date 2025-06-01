import { Composer, Markup, Scenes } from 'telegraf';
import { GenerateWizardState, MyContext } from '../../types/bot';
import { Logger } from '../../utils/rollbar.logger';
import { queueImageGenerationJob } from '../../services/generation';
import { exitScene, handleSceneError } from '../../services/scene';

// Group handlers
const effectSelectorHandler = new Composer<MyContext>();
const photoHandler = new Composer<MyContext>();
const ownPromptHandler = new Composer<MyContext>();

// Create the room design scene
export const roomDesignScene = new Scenes.WizardScene<MyContext>(
  'roomDesign',
  async ctx => {
    const state = ctx.wizard.state as GenerateWizardState;
    state.generationData.prompt = undefined;
    state.generationData.fileIds = undefined;
    try {
      await showRoomDesignEffectSelection(ctx);
      return ctx.wizard.next();
    } catch (error) {
      console.error('Error in roomDesign scene:', error);
      await handleSceneError(ctx, error, 'roomDesign');
    }
  },
  effectSelectorHandler,
  photoHandler,
  ownPromptHandler
);

// Room design effect options
const roomDesignEffectOptions = [
  'room_design_own_prompt',
  'room_design_remove_furniture',
  'room_design_hi_tech',
  'room_design_country',
  'room_design_country_modern',
  'room_design_classic',
];

/**
 * Sends the room design effect selection message and keyboard.
 */
async function showRoomDesignEffectSelection(ctx: MyContext): Promise<void> {
  // Create localized button labels
  const effectLabels = {
    room_design_own_prompt: ctx.i18n.t('bot:generate.room_design_effect_own_prompt'),
    room_design_remove_furniture: ctx.i18n.t('bot:generate.room_design_effect_remove_furniture'),
    room_design_hi_tech: ctx.i18n.t('bot:generate.room_design_effect_hi_tech'),
    room_design_country: ctx.i18n.t('bot:generate.room_design_effect_country'),
    room_design_country_modern: ctx.i18n.t('bot:generate.room_design_effect_country_modern'),
    room_design_classic: ctx.i18n.t('bot:generate.room_design_effect_classic'),
  };

  // Create buttons for each banner effect
  const effectButtons = roomDesignEffectOptions.map(effect =>
    Markup.button.callback(effectLabels[effect], `select_room_design_effect_${effect}`)
  );

  const keyboardRows = [];
  // Push own prompt button
  keyboardRows.push([effectButtons[0]]);

  // Arrange buttons
  for (let i = 1; i < effectButtons.length; i += 2) {
    const row = [effectButtons[i]];
    if (i + 1 < effectButtons.length) {
      row.push(effectButtons[i + 1]);
      // Push empty button to align
    } else {
      const emptyButton = Markup.button.callback(' ', 'noop');
      row.push(emptyButton);
    }
    keyboardRows.push(row);
  }

  const replyMarkup = Markup.inlineKeyboard(keyboardRows).reply_markup;

  const messageText = ctx.i18n.t('bot:generate.send_photo_for_effect');

  try {
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(messageText, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
    } else {
      await ctx.reply(messageText, {
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      });
    }
  } catch (error) {
    Logger.warn('Failed to edit or send room design effect selection message, sending new one.', {
      error,
    });
    await ctx.reply(messageText, {
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    });
  }
}

// Handle effect selection
roomDesignScene.action(/^select_room_design_effect_(.+)$/, async ctx => {
  await ctx.answerCbQuery();

  const state = ctx.scene.state as GenerateWizardState;
  const selectedEffect = ctx.match[1];

  // Store the selected effect for later use
  state.generationData.roomDesignEffect = selectedEffect;

  // Prompt for photo
  try {
    await ctx.editMessageText(ctx.i18n.t('bot:generate.send_photo_for_effect'), {
      parse_mode: 'HTML',
    });
  } catch (error) {
    // If editing fails, send a new message
    await ctx.reply(ctx.i18n.t('bot:generate.send_photo_for_effect'), {
      parse_mode: 'HTML',
    });
  }

  if (selectedEffect === 'room_design_own_prompt') {
    return ctx.wizard.selectStep(3);
  } else {
    return ctx.wizard.selectStep(2);
  }
});

// Handle photo message
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
  await ctx.reply(ctx.i18n.t('bot:generate.send_room_not_prompt'));
});

ownPromptHandler.on('photo', async ctx => {
  const state = ctx.wizard.state as GenerateWizardState;
  const photoSizes = ctx.message.photo;
  const largestPhoto = photoSizes[photoSizes.length - 1];
  state.generationData.fileIds = [largestPhoto.file_id];
  await ctx.reply(ctx.i18n.t('bot:generate.send_prompt_for_design'));
});

ownPromptHandler.on('document', async ctx => {
  const { document } = ctx.message;
  if (!document.mime_type?.startsWith('image/')) {
    await ctx.reply(ctx.i18n.t('bot:generate.not_an_image'));
    return;
  }
  const state = ctx.wizard.state as GenerateWizardState;
  state.generationData.fileIds = [document.file_id];
  await ctx.reply(ctx.i18n.t('bot:generate.send_prompt_for_design'));
});

ownPromptHandler.on('text', async ctx => {
  if (ctx.message.text === '/cancel') {
    return exitScene(ctx, 'bot:generate.cancelled');
  }
  const state = ctx.wizard.state as GenerateWizardState;
  state.generationData.prompt = ctx.message.text;

  if (state.generationData.fileIds && state.generationData.fileIds.length > 0) {    // Clear image buffer even error occurs
    const tempFileId = state.generationData.fileIds[0];
    state.generationData.fileIds = undefined;
    await handlePhotoInput(ctx, tempFileId);
  } else {
    await ctx.reply(ctx.i18n.t('bot:generate.send_photo_for_effect'));
    return ctx.wizard.selectStep(2);
  }
});

// Generic error handler for the scene
async function exitWithError(ctx: MyContext, messageKey: string) {
  try {
    await ctx.reply(ctx.i18n.t(messageKey));
  } catch (replyError) {
    Logger.warn(`Failed to send error message ${messageKey}`, {
      userId: ctx.from?.id,
      error: replyError,
    });
  }
  return ctx.scene.leave();
}

/**
 * Handles photo/document input from the user.
 */
async function handlePhotoInput(ctx: MyContext, fileId: string): Promise<void> {
  const state = ctx.wizard.state as GenerateWizardState;
  if (!state?.generationData || !state?.userData?.id || !state?.userSettings?.resolution) {
    Logger.warn('State missing in photo handler', { userId: ctx.from?.id });
    return exitWithError(ctx, 'bot:errors.general');
  }

  const { roomDesignEffect, prompt } = state.generationData;
  const { id: userId, language } = state.userData;
  const { resolution } = state.userSettings;

  if (!roomDesignEffect) {
    Logger.warn('Room design effect not set in photo handler', { userId: ctx.from?.id });
    return exitWithError(ctx, 'bot:errors.general');
  }

  try {
    // Send confirmation and queue the job
    const statusMessage = await ctx.reply(ctx.i18n.t('bot:generate.processing_queued'), {
      parse_mode: 'HTML',
    });

    await queueImageGenerationJob({
      userId,
      generationId: '', // Will be generated in the service
      fileIds: [fileId], // Pass file ID from Telegram
      roomDesignEffect,
      effectObject: 'room design',
      prompt,
      chatId: ctx.chat?.id.toString() || '',
      messageId: statusMessage.message_id,
      language: language || ctx.i18n.locale || 'en',
      resolution: resolution,
      apiProvider: 'openai',
    });
  } catch (error) {
    Logger.error(error, { context: 'queueImageGenerationJob', userId });
    await ctx.reply(ctx.i18n.t('bot:generate.queue_error'));
  }

  // Leave the scene after queuing
  await ctx.scene.leave();
}
