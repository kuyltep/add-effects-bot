import { Markup, Scenes } from 'telegraf';
import { MyContext } from '../../types/bot';
import { handleSceneError, exitScene } from '../../services/scene';
import { VideoSceneState } from '../../types/bot/scene.type';
import { 
  validateUser, 
  resolveImagePath, 
  processVideoGeneration,
  VIDEO_GENERATION_COST
} from '../../services/videoSceneUtils';

// Create the video effect scene
export const videoEffectScene = new Scenes.BaseScene<MyContext>('videoEffect');

// Effect options with paired indication
const videoOnlyEffects = [
  { id: 'kiss', i18nKey: 'bot:effects.kiss', paired: true },
  { id: 'jesus', i18nKey: 'bot:effects.jesus', paired: false },
  { id: 'hug', i18nKey: 'bot:effects.hug', paired: true },
  { id: 'microwave', i18nKey: 'bot:effects.microwave', paired: false },
];

const commonEffects = [
  { id: 'animation', i18nKey: 'bot:video.animation_button', paired: false },
  { id: 'custom', i18nKey: 'bot:video.use_prompt_button', paired: false },
];

// Function to get effects based on source
function getEffects(source?: string) {
  if (source === 'generate') {
    // When coming from generate scene, show all effects
    return [...videoOnlyEffects, ...commonEffects];
  } else {
    // When coming from command, only show video effects
    return [...videoOnlyEffects];
  }
}

// Effect prompts mapping
const EFFECT_PROMPTS: Record<string, string> = {
  'claymation': 'The characters move in a stop-motion claymation style, with slightly exaggerated movements and clay-like texture. Camera fixed.',
  'ghibli': 'The characters move in a smooth, Ghibli animation style with gentle movements and expressions. Light breeze effect. Camera fixed.',
  'pixar': 'The characters move in a Pixar-style 3D animation with smooth, expressive movements and bright, colorful appearance. Camera fixed.',
  'plushify': 'The characters move like soft plush toys with slight bouncy movements and fabric-like texture. Camera fixed.',
  'ghiblify': 'The characters move in a hand-drawn anime style with fluid movements and emotional expressions. Gentle ambient lighting. Camera fixed.',
  'cartoonify': 'The characters move in a classic cartoon style with exaggerated, bouncy movements and simplified features. Camera fixed.',
  'kiss': 'The characters move slightly and kiss each other with naturalistic movements. Camera fixed.',
  'jesus': 'The character is embraced by a Jesus-like figure with divine light and gentle movements. Camera fixed.',
  'hug': 'The characters hug each other with warm, natural movements. Camera fixed.',
  'microwave': 'The character spins around slowly like in a microwave with smooth rotation. Camera fixed.',
  'animation': 'The character or characters simply look forward and move slightly. Their movements are orderly and restrained. They smile faintly. Camera fixed',
};

// Scene enter handler
videoEffectScene.enter(async (ctx) => {
  try {
    // Initialize state if not set and ensure source is set
    const state = ctx.scene.state as VideoSceneState;
    
    // Default to 'command' if source is not specified
    if (!state.source) {
      state.source = 'command';
    }
    
    // Validate user
    const user = await validateUser(ctx);
    if (!user) {
      return await exitScene(ctx);
    }

    // If coming from generate scene, skip image check and go straight to effect selection
    if (state.source === 'generate') {
      await showEffectSelectionNoImage(ctx);
      return;
    }

    // Otherwise, check for existing image path (only for command entry)
    const imagePath = await resolveImagePath(ctx, state);
    if (imagePath) {
      // If we have an image path, show effect selection
      await showEffectSelection(ctx, imagePath);
    } else {
      // If no image path, we need to show effect selection first
      // and then wait for user to upload photo
      await showEffectSelectionNoImage(ctx);
    }
  } catch (error) {
    console.error('Error in videoEffect scene:', error);
    await handleSceneError(ctx, error, 'videoEffect');
  }
});

/**
 * Display effect selection when we don't have an image yet
 */
async function showEffectSelectionNoImage(ctx: MyContext) {
  const state = ctx.scene.state as VideoSceneState;
  const effectOptions = getEffects(state.source || "command");
  
  // Create effect selection buttons - 2 per row
  const effectButtons = [];
  for (let i = 0; i < effectOptions.length; i += 2) {
    const row = [];
    
    // Add first button in row
    const firstOption = effectOptions[i];
    const firstLabel = `${ctx.i18n.t(firstOption.i18nKey)}${firstOption.paired ? ' 👥' : ''}`;
    row.push(Markup.button.callback(firstLabel, `select_effect:${firstOption.id}`));
    
    // Add second button if exists
    if (i + 1 < effectOptions.length) {
      const secondOption = effectOptions[i + 1];
      const secondLabel = `${ctx.i18n.t(secondOption.i18nKey)}${secondOption.paired ? ' 👥' : ''}`;
      row.push(Markup.button.callback(secondLabel, `select_effect:${secondOption.id}`));
    }
    
    effectButtons.push(row);
  }
  
  // Add back button in its own row
  effectButtons.push([Markup.button.callback(ctx.i18n.t('bot:video.back_button'), 'back')]);

  // Show effect selection
  const sentMessage = await ctx.reply(
    ctx.i18n.t('bot:effects.select_effect', { 
      cost: VIDEO_GENERATION_COST
    }) + '\n\n' + ctx.i18n.t('bot:effects.paired_note'),
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(effectButtons)
    }
  );
  
  // Store the message ID for later
  state.messageId = sentMessage.message_id;
}

/**
 * Display effect selection with the image
 */
async function showEffectSelection(ctx: MyContext, imagePath: string) {
  const state = ctx.scene.state as VideoSceneState;
  const effectOptions = getEffects(state.source);
  
  // Create effect selection buttons - 2 per row
  const effectButtons = [];
  for (let i = 0; i < effectOptions.length; i += 2) {
    const row = [];
    
    // Add first button in row
    const firstOption = effectOptions[i];
    const firstLabel = `${ctx.i18n.t(firstOption.i18nKey)}${firstOption.paired ? ' 👥' : ''}`;
    row.push(Markup.button.callback(firstLabel, `effect:${firstOption.id}`));
    
    // Add second button if exists
    if (i + 1 < effectOptions.length) {
      const secondOption = effectOptions[i + 1];
      const secondLabel = `${ctx.i18n.t(secondOption.i18nKey)}${secondOption.paired ? ' 👥' : ''}`;
      row.push(Markup.button.callback(secondLabel, `effect:${secondOption.id}`));
    }
    
    effectButtons.push(row);
  }
  
  // Add back button in its own row
  effectButtons.push([Markup.button.callback(ctx.i18n.t('bot:video.back_button'), 'back')]);

  // Show image and prompt for effect selection
  const sentMessage = await ctx.replyWithPhoto(
    imagePath.startsWith('http') ? imagePath : { source: imagePath },
    {
      caption: ctx.i18n.t('bot:effects.select_effect', { 
        cost: VIDEO_GENERATION_COST
      }) + '\n\n' + ctx.i18n.t('bot:effects.paired_note'),
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(effectButtons)
    }
  );
  
  // Store message ID for later deletion if needed
  state.messageId = sentMessage.message_id;
}

// Handle all effect type selections
videoEffectScene.action(/^effect:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  
  // Extract the selected effect from the callback data
  const effectMatch = ctx.match[0].match(/^effect:(.+)$/);
  if (!effectMatch) return;
  
  const selectedEffect = effectMatch[1];
  const prompt = EFFECT_PROMPTS[selectedEffect] || '';
  
  await processVideoGeneration(ctx, selectedEffect, prompt);
});

// Handle effect selection when no image exists yet
videoEffectScene.action(/^select_effect:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  
  // Extract the selected effect from the callback data
  const effectMatch = ctx.match[0].match(/^select_effect:(.+)$/);
  if (!effectMatch) return;
  
  const selectedEffect = effectMatch[1];
  const state = ctx.scene.state as VideoSceneState;
  
  // Store the selected effect for later use
  state.selectedEffect = selectedEffect;
  
  // If custom prompt is selected, prompt for text input
  if (selectedEffect === 'custom') {
    state.waitingForPrompt = true;
    await ctx.reply(ctx.i18n.t('bot:video.enter_prompt'));
  } else {
    // Otherwise, prompt for photo upload
    await ctx.reply(ctx.i18n.t('bot:generate.send_photo_for_effect'));
  }
});

// Handle photo uploads
videoEffectScene.on('photo', async (ctx) => {
  const state = ctx.scene.state as VideoSceneState;
  
  // If we're not expecting a photo, ignore
  if (!state.selectedEffect) {
    return;
  }
  
  try {
    // Get the photo ID
    const photoSizes = ctx.message.photo;
    const largestPhoto = photoSizes[photoSizes.length - 1];
    const fileId = largestPhoto.file_id;
    
    // Use the selected effect from state
    const selectedEffect = state.selectedEffect;
    let prompt = EFFECT_PROMPTS[selectedEffect] || '';
    
    // If we have a custom prompt waiting, use that
    if (state.customPrompt) {
      prompt = state.customPrompt;
    }
    
    // Send processing message and queue the job
    await processVideoGeneration(ctx, selectedEffect, prompt, fileId);
    
  } catch (error) {
    await handleSceneError(ctx, error, 'videoEffect');
  }
});

// Handle document uploads (for images)
videoEffectScene.on('document', async (ctx) => {
  const state = ctx.scene.state as VideoSceneState;
  
  // If we're not expecting a document, ignore
  if (!state.selectedEffect) {
    return;
  }
  
  // Make sure it's an image
  const { document } = ctx.message;
  if (!document.mime_type?.startsWith('image/')) {
    await ctx.reply(ctx.i18n.t('bot:generate.not_an_image'));
    return;
  }
  
  try {
    // Use the document ID
    const fileId = document.file_id;
    
    // Use the selected effect from state
    const selectedEffect = state.selectedEffect;
    let prompt = EFFECT_PROMPTS[selectedEffect] || '';
    
    // If we have a custom prompt waiting, use that
    if (state.customPrompt) {
      prompt = state.customPrompt;
    }
    
    // Send processing message and queue the job
    await processVideoGeneration(ctx, selectedEffect, prompt, fileId);
    
  } catch (error) {
    await handleSceneError(ctx, error, 'videoEffect');
  }
});

// Handle text input for custom prompts
videoEffectScene.on('text', async (ctx) => {
  const state = ctx.scene.state as VideoSceneState;
  
  // Check if we're waiting for a prompt
  if (state.waitingForPrompt) {
    // Save the prompt and stop waiting
    state.customPrompt = ctx.message.text;
    state.waitingForPrompt = false;
    
    // Now ask for photo
    await ctx.reply(ctx.i18n.t('bot:generate.send_photo_for_effect'));
    return;
  }
  
  // Handle other text messages
  if (ctx.message.text === '/cancel') {
    return exitScene(ctx, 'bot:video.cancelled');
  }
  
  // If we have a selected effect but no image yet, remind them
  if (state.selectedEffect) {
    await ctx.reply(ctx.i18n.t('bot:generate.send_photo_for_effect'));
  }
});

// Handle back button - just delete the message and exit scene
videoEffectScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  
  // Get the message ID from state or callback query
  const state = ctx.scene.state as VideoSceneState;
  const messageId = state.messageId || ctx.callbackQuery?.message?.message_id;
  
  // Delete the message if we have its ID
  if (messageId) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
    } catch (error) {
      console.error('Error deleting message:', error);
    }
  }
  
  return await exitScene(ctx);
}); 