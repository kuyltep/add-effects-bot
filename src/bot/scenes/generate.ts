import { Composer, Context, Markup, Scenes } from 'telegraf';
import { MyContext, GenerateWizardState, EffectType } from '../../types';
import {
  canUserGenerate,
  queueImageFromTextGenerationJob,
  queueImageGenerationJob,
} from '../../services/generation';
import { initializeWizardState, exitScene } from '../../services/scene';
import { Logger } from '../../utils/rollbar.logger';

// Resolution helper function
function getResolutionInfo(resolution: string) {
  const resolutions = {
    square: { width: 1024, height: 1024 },
    vertical: { width: 768, height: 1024 },
    horizontal: { width: 1024, height: 768 }
  };
  return resolutions[resolution.toLowerCase()] || resolutions.square;
}

// STEP HANDLERS
const initialOptionHandler = new Composer<MyContext>();
const effectSelectorHandler = new Composer<MyContext>();
const logoEffectSelectorHandler = new Composer<MyContext>();
const bannerEffectSelectorHandler = new Composer<MyContext>();
const photoHandler = new Composer<MyContext>();
const photoAndTextHandler = new Composer<MyContext>();
const appearanceEffectSelectorHandler = new Composer<MyContext>();
const appearancePhotoHandler = new Composer<MyContext>();
const appearancePromptHandler = new Composer<MyContext>();

const effectsPerPage = 8;

// Define effect types and their corresponding labels for the keyboard
const effectOptions: { key: EffectType; labelKey: string }[] = [
  // OpenAI-processed effects
  { key: 'claymation', labelKey: 'bot:generate.effect_claymation' },
  { key: 'ghibli', labelKey: 'bot:generate.effect_ghibli' },
  { key: 'pixar', labelKey: 'bot:generate.effect_pixar' },
  { key: 'bratz', labelKey: 'bot:generate.effect_bratz' },
  { key: 'cat', labelKey: 'bot:generate.effect_cat' },
  { key: 'dog', labelKey: 'bot:generate.effect_dog' },
  { key: 'sticker', labelKey: 'bot:generate.effect_sticker' },
  { key: 'new_disney', labelKey: 'bot:generate.effect_new_disney' },
  { key: 'old_disney', labelKey: 'bot:generate.effect_old_disney' },
  { key: 'mitchells', labelKey: 'bot:generate.effect_mitchells' },
  { key: 'dreamworks', labelKey: 'bot:generate.effect_dreamworks' },
  // FAL AI-processed effects (must be last)
  { key: 'plushify', labelKey: 'bot:generate.effect_plushify' },
  { key: 'ghiblify', labelKey: 'bot:generate.effect_ghiblify' },
  { key: 'cartoonify', labelKey: 'bot:generate.effect_cartoonify' },
  { key: 'cartoonify_2d', labelKey: 'bot:generate.effect_cartoonify_2d' },
  { key: 'style_transfer', labelKey: 'bot:generate.effect_style_transfer' },
];

// Logo effect options
const logoEffectOptions = [
  'logo_in_the_haze',
  'luminous_fluid',
  'molten_glass',
  'on_wood',
  'organic',
];

// Banner effect options
const bannerEffectOptions = [
  'banner_without_effects',
  'banner_in_the_haze',
  'banner_luminous_fluid',
  'banner_molten_glass',
  'banner_on_wood',
  'banner_organic',
];

// Appearance editing effect options
const appearanceEffectOptions: { key: EffectType; labelKey: string }[] = [
  { key: 'baby-version', labelKey: 'bot:generate.appearance_effect_baby_version' },
  { key: 'hair-change', labelKey: 'bot:generate.appearance_effect_hair_change' },
  { key: 'expression-change', labelKey: 'bot:generate.appearance_effect_expression_change' },
  { key: 'age-progression', labelKey: 'bot:generate.appearance_effect_age_progression' },
];

// WIZARD STEP TRANSITIONS & HANDLERS

/**
 * Displays the initial selection between photo styling and video effects
 */
async function showInitialOptions(ctx: MyContext): Promise<void> {
  const stylizePhotoText = ctx.i18n.t('bot:generate.effect_photo');
  const videoEffectsText = ctx.i18n.t('bot:generate.effect_video');
  const stylizeLogoText = ctx.i18n.t('bot:generate.stylize_logo');
  const appearanceEditingText = ctx.i18n.t('bot:generate.appearance_editing');
  // const stylizeBannerText = ctx.i18n.t('bot:generate.stylize_banner');
  // const stylizeRoomDesign = ctx.i18n.t('bot:generate.room_design');
  // const jointPhoto = ctx.i18n.t('bot:generate.joint_photo');

  await ctx.reply(ctx.i18n.t('bot:generate.select_option'), {
    parse_mode: 'HTML',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback(stylizePhotoText, 'select_photo_styling')],
      [Markup.button.callback(videoEffectsText, 'select_video_effects')],
      [Markup.button.callback(stylizeLogoText, 'select_logo_styling')],
      [Markup.button.callback(appearanceEditingText, 'select_appearance_editing')],
      // [Markup.button.callback(stylizeBannerText, 'select_banner_styling')],
      // [Markup.button.callback(stylizeRoomDesign, 'select_room_design')],
      // [Markup.button.callback(jointPhoto, 'select_joint_photo')],
    ]).reply_markup,
  });
}

/**
 * Sends the effect selection message and keyboard.
 */
async function showEffectSelection(ctx: MyContext): Promise<void> {
  const state = ctx.wizard.state as GenerateWizardState;
  state.currentPage = state.currentPage ?? 0;

  const start = state.currentPage * effectsPerPage;
  const end = start + effectsPerPage;
  const pageEffects = effectOptions.slice(start, end);

  const effectButtons = pageEffects.map(option =>
    Markup.button.callback(ctx.i18n.t(option.labelKey), `select_effect_${option.key}`)
  );

  const keyboardRows = [];
  for (let i = 0; i < effectButtons.length; i += 2) {
    const row = [effectButtons[i]];
    if (i + 1 < effectButtons.length) {
      row.push(effectButtons[i + 1]);
    }
    keyboardRows.push(row);
  }

  const navigationButtons = [];

  navigationButtons.push(Markup.button.callback('⬅️', 'previous_page'));
  navigationButtons.push(Markup.button.callback('➡️', 'next_page'));

  if (navigationButtons.length > 0) {
    keyboardRows.push(navigationButtons);
  }

  const messageText = ctx.i18n.t('bot:generate.select_effect_prompt');
  const replyMarkup = Markup.inlineKeyboard(keyboardRows).reply_markup;

  try {
    // Check if the message to edit exists by trying to edit it with the same content initially
    // This is a common pattern to avoid errors if the message was deleted.
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
    Logger.warn('Failed to edit or send effect selection message, sending new one.', { error });
    // Fallback to sending a new message if editing fails for any reason
    await ctx.reply(messageText, {
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    });
  }
}

/**
 * Sends the logo effect selection message and keyboard.
 */
async function showLogoEffectSelection(ctx: MyContext): Promise<void> {
  // Create localized button labels
  const effectLabels = {
    logo_in_the_haze: ctx.i18n.t('bot:generate.logo_effect_logo_in_the_haze'),
    luminous_fluid: ctx.i18n.t('bot:generate.logo_effect_luminous_fluid'),
    molten_glass: ctx.i18n.t('bot:generate.logo_effect_molten_glass'),
    on_wood: ctx.i18n.t('bot:generate.logo_effect_on_wood'),
    organic: ctx.i18n.t('bot:generate.logo_effect_organic'),
  };

  // Create buttons for each logo effect
  const effectButtons = logoEffectOptions.map(effect =>
    Markup.button.callback(effectLabels[effect], `select_logo_effect_${effect}`)
  );

  // Arrange buttons in two columns
  const keyboardRows = [];
  for (let i = 0; i < effectButtons.length; i += 1) {
    const row = [effectButtons[i]];
    keyboardRows.push(row);
  }

  const messageText = ctx.i18n.t('bot:generate.select_logo_style_prompt');

  const replyMarkup = Markup.inlineKeyboard(keyboardRows).reply_markup;

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
    Logger.warn('Failed to edit or send logo effect selection message, sending new one.', {
      error,
    });
    await ctx.reply(messageText, {
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    });
  }
}

/**
 * Sends the appearance effect selection message and keyboard.
 */
async function showAppearanceEffectSelection(ctx: MyContext): Promise<void> {
  // Create buttons for each appearance effect
  const effectButtons = appearanceEffectOptions.map(option =>
    Markup.button.callback(ctx.i18n.t(option.labelKey), `select_appearance_effect_${option.key}`)
  );

  // Arrange buttons in one column
  const keyboardRows = effectButtons.map(button => [button]);

  const messageText = ctx.i18n.t('bot:generate.select_appearance_effect_prompt');
  const replyMarkup = Markup.inlineKeyboard(keyboardRows).reply_markup;

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
    Logger.warn('Failed to edit or send appearance effect selection message, sending new one.', {
      error,
    });
    await ctx.reply(messageText, {
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    });
  }
}

/**
 * Sends the banner effect selection message and keyboard.
 */
async function showBannerEffectSelection(ctx: MyContext): Promise<void> {
  // Create localized button labels
  const effectLabels = {
    banner_without_effects: ctx.i18n.t('bot:generate.banner_effect_without_effects'),

    banner_in_the_haze: ctx.i18n.t('bot:generate.banner_effect_banner_in_the_haze'),
    banner_luminous_fluid: ctx.i18n.t('bot:generate.banner_effect_luminous_fluid'),
    banner_molten_glass: ctx.i18n.t('bot:generate.banner_effect_molten_glass'),
    banner_on_wood: ctx.i18n.t('bot:generate.banner_effect_on_wood'),
    banner_organic: ctx.i18n.t('bot:generate.banner_effect_organic'),
  };

  // Create buttons for each banner effect
  const effectButtons = bannerEffectOptions.map(effect =>
    Markup.button.callback(effectLabels[effect], `select_banner_effect_${effect}`)
  );

  // Arrange buttons
  const keyboardRows = [];
  for (let i = 0; i < effectButtons.length; i += 1) {
    const row = [effectButtons[i]];
    keyboardRows.push(row);
  }

  const messageText = ctx.i18n.t('bot:generate.select_banner_style_prompt');

  const replyMarkup = Markup.inlineKeyboard(keyboardRows).reply_markup;

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
    Logger.warn('Failed to edit or send banner effect selection message, sending new one.', {
      error,
    });
    await ctx.reply(messageText, {
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    });
  }
}

/**
 * Handles the selection of an effect.
 */
effectSelectorHandler.action(
  /select_effect_(claymation|ghibli|pixar|bratz|cat|dog|sticker|new_disney|old_disney|mitchells|dreamworks|plushify|ghiblify|cartoonify|cartoonify_2d|style_transfer)/,
  async ctx => {
    await ctx.answerCbQuery();
    const state = ctx.wizard.state as GenerateWizardState;
    const selectedEffect = ctx.match[1] as EffectType;

    if (!state?.generationData) {
      Logger.warn('State missing in effect selection', { userId: ctx.from?.id });
      return exitWithError(ctx, 'bot:errors.general');
    }

    // Store the selected effect
    state.generationData.effect = selectedEffect;

    // Prompt for photo with resolution info
    const resolution = state.userSettings?.resolution || 'square';
    const resolutionInfo = getResolutionInfo(resolution);
    
    try {
      await ctx.editMessageText(ctx.i18n.t('bot:generate.send_photo_for_effect', {
        resolution: ctx.i18n.t(`bot:settings.resolution_${resolution.toLowerCase()}`),
        width: resolutionInfo.width,
        height: resolutionInfo.height
      }), {
        parse_mode: 'HTML',
      });
    } catch (error) {
      // If editing fails (e.g., message too old), send a new message
      await ctx.reply(ctx.i18n.t('bot:generate.send_photo_for_effect', {
        resolution: ctx.i18n.t(`bot:settings.resolution_${resolution.toLowerCase()}`),
        width: resolutionInfo.width,
        height: resolutionInfo.height
      }), {
        parse_mode: 'HTML',
      });
    }

    // Move to the photo handler step
    return ctx.wizard.next();
  }
);

/**
 * Handles the selection of a logo effect.
 */
logoEffectSelectorHandler.action(
  /select_logo_effect_(logo_in_the_haze|luminous_fluid|molten_glass|on_wood|organic)/,
  async ctx => {
    await ctx.answerCbQuery();
    const state = ctx.wizard.state as GenerateWizardState;
    const selectedLogoEffect = ctx.match[1];

    if (!state?.generationData) {
      Logger.warn('State missing in logo effect selection', { userId: ctx.from?.id });
      return exitWithError(ctx, 'bot:errors.general');
    }

    // Store the selected logo effect
    state.generationData.logoEffect = selectedLogoEffect;

    // Prompt for photo with resolution info
    const resolution = state.userSettings?.resolution || 'square';
    const resolutionInfo = getResolutionInfo(resolution);
    
    try {
      await ctx.editMessageText(ctx.i18n.t('bot:generate.send_logo_for_effect', {
        resolution: ctx.i18n.t(`bot:settings.resolution_${resolution.toLowerCase()}`),
        width: resolutionInfo.width,
        height: resolutionInfo.height
      }), {
        parse_mode: 'HTML',
      });
    } catch (error) {
      // If editing fails, send a new message
      await ctx.reply(ctx.i18n.t('bot:generate.send_logo_for_effect', {
        resolution: ctx.i18n.t(`bot:settings.resolution_${resolution.toLowerCase()}`),
        width: resolutionInfo.width,
        height: resolutionInfo.height
      }), {
        parse_mode: 'HTML',
      });
    }

    // Move to the photo handler step
    return ctx.wizard.selectStep(4);
  }
);

/**
 * Handles the selection of an appearance effect.
 */
appearanceEffectSelectorHandler.action(
  /select_appearance_effect_(baby-version|hair-change|expression-change|age-progression)/,
  async ctx => {
    await ctx.answerCbQuery();
    const state = ctx.wizard.state as GenerateWizardState;
    const selectedAppearanceEffect = ctx.match[1] as EffectType;

    if (!state?.generationData) {
      Logger.warn('State missing in appearance effect selection', { userId: ctx.from?.id });
      return exitWithError(ctx, 'bot:errors.general');
    }

    // Store the selected appearance effect
    state.generationData.effect = selectedAppearanceEffect;

    // Prompt for photo with resolution info
    const resolution = state.userSettings?.resolution || 'square';
    const resolutionInfo = getResolutionInfo(resolution);
    
    try {
      await ctx.editMessageText(ctx.i18n.t('bot:generate.send_photo_for_appearance_effect', {
        resolution: ctx.i18n.t(`bot:settings.resolution_${resolution.toLowerCase()}`),
        width: resolutionInfo.width,
        height: resolutionInfo.height
      }), {
        parse_mode: 'HTML',
      });
    } catch (error) {
      // If editing fails, send a new message
      await ctx.reply(ctx.i18n.t('bot:generate.send_photo_for_appearance_effect', {
        resolution: ctx.i18n.t(`bot:settings.resolution_${resolution.toLowerCase()}`),
        width: resolutionInfo.width,
        height: resolutionInfo.height
      }), {
        parse_mode: 'HTML',
      });
    }

    // Move to the appearance photo handler step
    return ctx.wizard.selectStep(7);
  }
);

/**
 * Handles the selection of a banner effect.
 */
bannerEffectSelectorHandler.action(
  /select_banner_effect_(banner_without_effects|banner_in_the_haze|banner_luminous_fluid|banner_molten_glass|banner_on_wood|banner_organic)/,
  async ctx => {
    await ctx.answerCbQuery();
    const state = ctx.wizard.state as GenerateWizardState;
    const selectedBannerEffect = ctx.match[1];

    if (!state?.generationData) {
      Logger.warn('State missing in banner effect selection', { userId: ctx.from?.id });
      return exitWithError(ctx, 'bot:errors.general');
    }

    // Store the selected banner effect
    state.generationData.bannerEffect = selectedBannerEffect;

    // Prompt for photo
    try {
      await ctx.editMessageText(ctx.i18n.t('bot:generate.send_banner_for_effect'), {
        parse_mode: 'HTML',
      });
    } catch (error) {
      // If editing fails, send a new message
      await ctx.reply(ctx.i18n.t('bot:generate.send_banner_for_effect'), {
        parse_mode: 'HTML',
      });
    }

    // Move to the photo + text handler step
    return ctx.wizard.selectStep(6);
  }
);

effectSelectorHandler.action('previous_page', async ctx => {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as GenerateWizardState;
  if (state.currentPage && state.currentPage > 0) {
    state.currentPage--;
    await showEffectSelection(ctx);
  }
});

effectSelectorHandler.action('next_page', async ctx => {
  await ctx.answerCbQuery();
  const state = ctx.wizard.state as GenerateWizardState;
  if (state.currentPage !== undefined) {
    // Check if currentPage is defined
    const maxPage = Math.ceil(effectOptions.length / effectsPerPage) - 1;
    if (state.currentPage < maxPage) {
      state.currentPage++;
      await showEffectSelection(ctx);
    }
  }
});

/**
 * Handles photo/document input from the user.
 */
async function handlePhotoInput(ctx: MyContext, fileId: string): Promise<void> {
  const state = ctx.wizard.state as GenerateWizardState;
  if (!state?.generationData || !state?.userData?.id || !state?.userSettings?.resolution) {
    Logger.warn('State missing in photo handler', { userId: ctx.from?.id });
    return exitWithError(ctx, 'bot:errors.general');
  }

  const { effect, logoEffect, bannerEffect, prompt } = state.generationData;
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
      fileIds: [fileId], // Pass file ID from Telegram
      effect,
      logoEffect, // Pass the logo effect if it exists
      bannerEffect,
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

async function handleTextInput(ctx: MyContext): Promise<void> {
  const state = ctx.wizard.state as GenerateWizardState;
  if (!state?.generationData || !state?.userData?.id || !state?.userSettings?.resolution) {
    Logger.warn('State missing in photoAndText handler', { userId: ctx.from?.id });
    return exitWithError(ctx, 'bot:errors.general');
  }

  const { effect, logoEffect, bannerEffect, prompt } = state.generationData;
  const { id: userId, language } = state.userData;

  try {
    // Send confirmation and queue the job
    const statusMessage = await ctx.reply(ctx.i18n.t('bot:generate.processing_queued'), {
      parse_mode: 'HTML',
    });

    await queueImageFromTextGenerationJob({
      userId,
      generationId: '', // Will be generated in the service
      effect,
      logoEffect, // Pass the logo effect if it exists
      bannerEffect, // Pass the banner effect if it exists
      prompt, // Pass the prompt if it exists
      chatId: ctx.chat?.id.toString() || '',
      messageId: statusMessage.message_id,
      language: language || ctx.i18n.locale || 'en',
      apiProvider: 'openai',
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
  const state = ctx.wizard.state as GenerateWizardState;
  const resolution = state.userSettings?.resolution || 'square';
  const resolutionInfo = getResolutionInfo(resolution);
  
  await ctx.reply(ctx.i18n.t('bot:generate.send_photo_for_effect', {
    resolution: ctx.i18n.t(`bot:settings.resolution_${resolution.toLowerCase()}`),
    width: resolutionInfo.width,
    height: resolutionInfo.height
  }), {
    parse_mode: 'HTML',
  });
});

// Handle all other message types in photo step
photoHandler.on('message', async ctx => {
  const state = ctx.wizard.state as GenerateWizardState;
  const resolution = state.userSettings?.resolution || 'square';
  const resolutionInfo = getResolutionInfo(resolution);
  
  await ctx.reply(ctx.i18n.t('bot:generate.send_photo_for_effect', {
    resolution: ctx.i18n.t(`bot:settings.resolution_${resolution.toLowerCase()}`),
    width: resolutionInfo.width,
    height: resolutionInfo.height
  }), {
    parse_mode: 'HTML',
  });
});

// Handle photo messages
photoAndTextHandler.on('photo', async ctx => {
  const photoSizes = ctx.message.photo;
  const largestPhoto = photoSizes[photoSizes.length - 1];
  const state = ctx.wizard.state as GenerateWizardState;
  state.generationData.fileIds = [largestPhoto.file_id];
  await ctx.reply(ctx.i18n.t('bot:generate.banner_wait_for_description'));
});

// Handle document messages
photoAndTextHandler.on('document', async ctx => {
  const { document } = ctx.message;
  if (!document.mime_type?.startsWith('image/')) {
    await ctx.reply(ctx.i18n.t('bot:generate.not_an_image'));
    return; // Stay in this step
  }
  const state = ctx.wizard.state as GenerateWizardState;
  state.generationData.fileIds = [document.file_id];
  await ctx.reply(ctx.i18n.t('bot:generate.banner_wait_for_description'));
});

// Handle text messages
photoAndTextHandler.on('text', async ctx => {
  if (ctx.message.text === '/cancel') {
    return exitScene(ctx, 'bot:generate.cancelled');
  }
  const state = ctx.wizard.state as GenerateWizardState;
  state.generationData.prompt = ctx.message.text;

  if (state.generationData.fileIds) {
    // Clear image buffer even error occurs
    const tempFileId = state.generationData.fileIds[0];
    state.generationData.fileIds = undefined;
    await handlePhotoInput(ctx, tempFileId);
  } else {
    await handleTextInput(ctx);
  }
});

// Handle all other message types in photo step
photoAndTextHandler.on('message', async ctx => {
  await ctx.reply(ctx.i18n.t('bot:generate.banner_wait_for_description'));
});

// Handler for processing user's photo input for appearance effects
appearancePhotoHandler.on('photo', async ctx => {
  const photoSizes = ctx.message.photo;
  const largestPhoto = photoSizes[photoSizes.length - 1];
  const state = ctx.wizard.state as GenerateWizardState;
  state.generationData.fileIds = [largestPhoto.file_id];
  await ctx.reply(ctx.i18n.t('bot:generate.send_appearance_prompt'));
  return ctx.wizard.next(); // Move to prompt handler
});

// Handle document messages for appearance effects
appearancePhotoHandler.on('document', async ctx => {
  const { document } = ctx.message;
  if (!document.mime_type?.startsWith('image/')) {
    await ctx.reply(ctx.i18n.t('bot:generate.not_an_image'));
    return; // Stay in this step
  }
  const state = ctx.wizard.state as GenerateWizardState;
  state.generationData.fileIds = [document.file_id];
  await ctx.reply(ctx.i18n.t('bot:generate.send_appearance_prompt'));
  return ctx.wizard.next(); // Move to prompt handler
});

// Handle text messages (invalid input in appearance photo step)
appearancePhotoHandler.on('text', async ctx => {
  if (ctx.message.text === '/cancel') {
    return exitScene(ctx, 'bot:generate.cancelled');
  }
  const state = ctx.wizard.state as GenerateWizardState;
  const resolution = state.userSettings?.resolution || 'square';
  const resolutionInfo = getResolutionInfo(resolution);
  
  await ctx.reply(ctx.i18n.t('bot:generate.send_photo_for_appearance_effect', {
    resolution: ctx.i18n.t(`bot:settings.resolution_${resolution.toLowerCase()}`),
    width: resolutionInfo.width,
    height: resolutionInfo.height
  }), {
    parse_mode: 'HTML',
  });
});

// Handle all other message types in appearance photo step
appearancePhotoHandler.on('message', async ctx => {
  const state = ctx.wizard.state as GenerateWizardState;
  const resolution = state.userSettings?.resolution || 'square';
  const resolutionInfo = getResolutionInfo(resolution);
  
  await ctx.reply(ctx.i18n.t('bot:generate.send_photo_for_appearance_effect', {
    resolution: ctx.i18n.t(`bot:settings.resolution_${resolution.toLowerCase()}`),
    width: resolutionInfo.width,
    height: resolutionInfo.height
  }));
});

// Handle appearance prompt input
appearancePromptHandler.on('text', async ctx => {
  if (ctx.message.text === '/cancel') {
    return exitScene(ctx, 'bot:generate.cancelled');
  }

  const state = ctx.wizard.state as GenerateWizardState;
  if (!state?.generationData || !state?.userData?.id || !state?.userSettings?.resolution) {
    Logger.warn('State missing in appearance prompt handler', { userId: ctx.from?.id });
    return exitWithError(ctx, 'bot:errors.general');
  }

  const originalPrompt = ctx.message.text;
  
  try {
    // Import and use the language service to translate the prompt
    const { processPrompt } = await import('../../services/language');
    const { translatedPrompt } = await processPrompt(originalPrompt);
    
    // Store the translated prompt
    state.generationData.appearancePrompt = translatedPrompt;

    const { effect } = state.generationData;
    const { id: userId, language } = state.userData;
    const { resolution } = state.userSettings;

    // Send confirmation and queue the job
    const statusMessage = await ctx.reply(ctx.i18n.t('bot:generate.processing_queued'), {
      parse_mode: 'HTML',
    });

    await queueImageGenerationJob({
      userId,
      generationId: '', // Will be generated in the service
      fileIds: state.generationData.fileIds, // Pass file IDs from state
      effect,
      appearancePrompt: translatedPrompt,
      chatId: ctx.chat?.id.toString() || '',
      messageId: statusMessage.message_id,
      language: language || ctx.i18n.locale || 'en',
      resolution: resolution,
      apiProvider: 'fal-ai', // Appearance effects use FAL AI
    });
  } catch (error) {
    Logger.error(error, { context: 'queueImageGenerationJob', userId: state.userData.id });
    await ctx.reply(ctx.i18n.t('bot:generate.queue_error'));
  }

  // Leave the scene after queuing
  await ctx.scene.leave();
});

// Handle non-text messages in appearance prompt step
appearancePromptHandler.on('message', async ctx => {
  await ctx.reply(ctx.i18n.t('bot:generate.send_appearance_prompt'));
});

// Handle initial options
initialOptionHandler.action('select_photo_styling', async ctx => {
  await ctx.answerCbQuery();
  await showEffectSelection(ctx);
  return ctx.wizard.selectStep(3); // Move to effect selection handler step
});

initialOptionHandler.action('select_video_effects', async ctx => {
  await ctx.answerCbQuery();
  // Enter the videoEffect scene with source information
  return ctx.scene.enter('videoEffect', { source: 'generate' });
});

initialOptionHandler.action('select_logo_styling', async ctx => {
  await ctx.answerCbQuery();
  await showLogoEffectSelection(ctx);
  return ctx.wizard.selectStep(2); // Move to logo effect selection handler step
});

initialOptionHandler.action('select_appearance_editing', async ctx => {
  await ctx.answerCbQuery();
  await showAppearanceEffectSelection(ctx);
  return ctx.wizard.selectStep(9); // Move to appearance effect selection handler step
});

initialOptionHandler.action('select_banner_styling', async ctx => {
  await ctx.answerCbQuery();
  await showBannerEffectSelection(ctx);
  return ctx.wizard.selectStep(5); // Move to banner effect selection handler step
});

initialOptionHandler.action('select_room_design', async ctx => {
  await ctx.answerCbQuery();
  return ctx.scene.enter('roomDesign', ctx.wizard.state);
});

initialOptionHandler.action('select_joint_photo', async ctx => {
  await ctx.answerCbQuery();
  return ctx.scene.enter('jointPhoto', ctx.wizard.state);
});

initialOptionHandler.action('cancel_generation', async ctx => {
  await ctx.answerCbQuery();
  return exitScene(ctx, 'bot:generate.cancelled');
});

// SCENE DEFINITION
export const generateScene = new Scenes.WizardScene<MyContext>(
  'generate',
  // Step 0: Initial check and options selection
  async ctx => {
    ctx.session.fileId = undefined;
    const telegramId = ctx.from?.id.toString() || '';
    const initState = await initializeWizardState(ctx, telegramId);
    if (!initState || !initState.userData) {
      return exitWithError(ctx, 'bot:errors.not_registered'); // Or general error
    }

    const canGenerate = await canUserGenerate(ctx, initState.userData);
    if (!canGenerate) {
      return ctx.scene.leave();
    }

    await showInitialOptions(ctx);
    return ctx.wizard.next(); // Move to initial options handler step
  },
  // Step 1: Handle initial options selection
  initialOptionHandler,
  // Step 2: Handle logo effect selection callback
  logoEffectSelectorHandler,
  // Step 3: Handle effect selection callback
  effectSelectorHandler,
  // Step 4: Handle photo input
  photoHandler,
  // Step 5: Handle banner effect selection
  bannerEffectSelectorHandler,
  // Step 6: Handle photo + text input
  photoAndTextHandler,
  // Step 7: Handle appearance photo input
  appearancePhotoHandler,
  // Step 8: Handle appearance prompt input
  appearancePromptHandler,
  // Step 9: Handle appearance effect selection
  appearanceEffectSelectorHandler
);

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

// Setup general scene behaviors (like cancel)
// generateScene.command('cancel', async (ctx) => exitScene(ctx, 'bot:generate.cancelled'));
// Handle interruptions if needed (already partially handled by command handlers)
// generateScene.use(async (ctx, next) => { ... });
