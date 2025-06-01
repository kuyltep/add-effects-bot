import { Composer, Markup, Scenes } from 'telegraf';
import { GenerateWizardState, MyContext } from '../../types/bot';
import { Logger } from '../../utils/rollbar.logger';
import { queueImageGenerationJob } from '../../services/generation';
import { exitScene, handleSceneError } from '../../services/scene';

const jointPhotoEffectOptions = ['joint_photo_effect_own_prompt'];

const MAX_PHOTOS = 2;

// Group handlers
const initialOptionsHandler = new Composer<MyContext>();
const albumHandler = new Composer<MyContext>();

// Create the room design scene
export const jointPhotoScene = new Scenes.WizardScene<MyContext>(
  'jointPhoto',
  async ctx => {
    const state = ctx.wizard.state as GenerateWizardState;
    state.generationData.prompt = undefined;
    state.generationData.fileIds = undefined;

    try {
      await showJointPhotoEffectSelection(ctx);
      return ctx.wizard.next();
    } catch (error) {
      Logger.error('Error in jointPhoto scene:', error);
      await handleSceneError(ctx, error, 'jointPhoto');
    }
  },
  initialOptionsHandler,
  albumHandler
);

async function showJointPhotoEffectSelection(ctx: MyContext): Promise<void> {
  const effectLabels = {
    joint_photo_effect_own_prompt: ctx.i18n.t('bot:generate.joint_photo_effect_own_prompt'),
  };

  const effectButtons = jointPhotoEffectOptions.map(effect =>
    Markup.button.callback(effectLabels[effect], `select_joint_photo_effect_${effect}`)
  );

  // Create keyboard rows
  const keyboardRows = [];
  for (let i = 0; i < effectButtons.length; i += 1) {
    const row = [effectButtons[i]];
    keyboardRows.push(row);
  }

  // Add back button
  keyboardRows.push([
    Markup.button.callback(ctx.i18n.t('bot:generate.back_to_generate'), 'back_to_generate'),
  ]);

  const replyMarkup = Markup.inlineKeyboard(keyboardRows).reply_markup;
  const messageText = ctx.i18n.t('bot:generate.select_effect_prompt');

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
    Logger.warn('Failed to edit or send joint photo effect selection message, sending new one.', {
      error,
    });
    await ctx.reply(messageText, {
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    });
  }
}

initialOptionsHandler.action(/^select_joint_photo_effect_(.+)$/, async ctx => {
  await ctx.answerCbQuery();
  const state = ctx.scene.state as GenerateWizardState;
  const selectedEffect = ctx.match[1];
  state.generationData.jointPhotoEffect = selectedEffect;
  await ctx.reply(ctx.i18n.t('bot:generate.joint_photo_send_photo_for_effect'));
  return ctx.wizard.selectStep(2);
});

initialOptionsHandler.action('back_to_generate', async ctx => {
  await ctx.answerCbQuery();
  await ctx.scene.leave();
});

albumHandler.on('photo', async ctx => {
  const state = ctx.scene.state as GenerateWizardState;

  const currentPhotos = state.generationData.fileIds || [];
  const photos_amount = currentPhotos.length;
  const new_photos_amount = photos_amount + 1;

  if (photos_amount >= MAX_PHOTOS) {
    await ctx.reply(ctx.i18n.t('bot:generate.already_have_enough_photos'));
    return;
  }

  const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  state.generationData.fileIds = [...currentPhotos, fileId];

  if (ctx.message.caption) {
    state.generationData.prompt = ctx.message.caption;
    await ctx.reply(ctx.i18n.t('bot:generate.joint_photo_get_prompt'));
  }

  await ctx.reply(ctx.i18n.t('bot:generate.joint_photo_get_photo'));

  // Check if we can generate photo
  if (new_photos_amount === MAX_PHOTOS && state.generationData.prompt) {
    await handleInput(ctx);
    await ctx.scene.leave();
  }
});

albumHandler.on('document', async ctx => {
  const { document } = ctx.message;
  if (!document.mime_type?.startsWith('image/')) {
    await ctx.reply(ctx.i18n.t('bot:generate.not_an_image'));
    return; // Stay in this step
  }

  const state = ctx.scene.state as GenerateWizardState;

  const currentPhotos = state.generationData.fileIds || [];
  const photos_amount = currentPhotos.length;
  const new_photos_amount = photos_amount + 1;

  if (new_photos_amount >= MAX_PHOTOS) {
    await ctx.reply(ctx.i18n.t('bot:generate.already_have_enough_photos'));
    return;
  }

  const fileId = ctx.message.document.file_id;
  state.generationData.fileIds = [...currentPhotos, fileId];

  if (ctx.message.caption) {
    state.generationData.prompt = ctx.message.caption;
    await ctx.reply(ctx.i18n.t('bot:generate.joint_photo_get_prompt'));
  }

  await ctx.reply(ctx.i18n.t('bot:generate.joint_photo_get_photo'));

  if (new_photos_amount === MAX_PHOTOS && state.generationData.prompt) {
    await handleInput(ctx);
    await ctx.scene.leave();
  }
});

albumHandler.on('text', async ctx => {
  const state = ctx.scene.state as GenerateWizardState;

  if (state.generationData.prompt) {
    await ctx.reply(ctx.i18n.t('bot:generate.already_have_prompt'));
    return;
  }

  state.generationData.prompt = ctx.message.text;

  const currentPhotos = state.generationData.fileIds || [];
  const photos_amount = currentPhotos.length;

  await ctx.reply(ctx.i18n.t('bot:generate.joint_photo_get_prompt'));

  if (photos_amount === MAX_PHOTOS) {
    await handleInput(ctx);
    await ctx.scene.leave();
  }
});

// Handle all other message types
albumHandler.on('message', async ctx => {
  await ctx.reply(ctx.i18n.t('bot:generate.joint_photo_wrong_message'));
});

const handleInput = async (ctx: MyContext) => {
  const state = ctx.wizard.state as GenerateWizardState;
  if (!state?.generationData || !state?.userData?.id || !state?.userSettings?.resolution) {
    Logger.warn('State missing in photo handler', { userId: ctx.from?.id });
    return exitWithError(ctx, 'bot:errors.general');
  }

  const { prompt, fileIds, jointPhotoEffect } = state.generationData;
  const { id: userId, language } = state.userData;
  const { resolution } = state.userSettings;

  try {
    // Send confirmation and queue the job
    const statusMessage = await ctx.reply(ctx.i18n.t('bot:generate.processing_queued'), {
      parse_mode: 'HTML',
    });

    await queueImageGenerationJob({
      userId,
      generationId: '', // Will be generated in the service
      fileIds, // Pass file ID from Telegram
      prompt,
      jointPhotoEffect,
      chatId: ctx.chat?.id.toString() || '',
      messageId: statusMessage.message_id,
      language: language || ctx.i18n.locale || 'en',
      resolution: resolution,
      effectObject: 'joint_photo',
      apiProvider: 'runway',
    });
  } catch (error) {
    Logger.error(error, { context: 'queueImageGenerationJob', userId });
    await ctx.reply(ctx.i18n.t('bot:generate.queue_error'));
  }

  // Leave the scene after queuing
  await ctx.scene.leave();
};

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
