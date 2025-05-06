import { Markup, Scenes } from 'telegraf';
import { MyContext } from '../../types/bot';
import { handleSceneError, exitScene } from '../../services/scene';
import { VideoSceneState } from '../../types/bot/scene.type';
import { processPrompt } from '../../services/language';
import { 
  VIDEO_GENERATION_COST, 
  validateUser, 
  resolveImagePath, 
  processVideoGeneration 
} from '../../services/videoSceneUtils';

// Create the video scene
export const videoScene = new Scenes.BaseScene<MyContext>('video');

// Default prompt from environment variable
const VIDEO_GENERATION_PROMPT = "The character or characters simply look forward and move slightly. Their movements are orderly and restrained. They smile faintly. Camera fixed";

// Scene enter handler
videoScene.enter(async (ctx) => {
  try {
    // Validate user
    const user = await validateUser(ctx);
    if (!user) {
      return await exitScene(ctx);
    }

    // Validate and resolve image path
    const state = ctx.scene.state as VideoSceneState;
    const imagePath = await resolveImagePath(ctx, state);
    if (!imagePath) {
      return await exitScene(ctx);
    }

    // Show image and prompt for video generation
    const sentMessage = await ctx.replyWithPhoto(
      imagePath.startsWith('http') ? imagePath : { source: imagePath },
      {
        caption: ctx.i18n.t('bot:video.prompt_instructions', { 
          cost: VIDEO_GENERATION_COST
        }),
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(ctx.i18n.t('bot:video.animate_button'), 'animate')],
          [Markup.button.callback(ctx.i18n.t('bot:video.use_prompt_button'), 'use_prompt')],
          [Markup.button.callback(ctx.i18n.t('bot:video.back_button'), 'back')]
        ])
      }
    );
    
    // Store message ID for later deletion if needed
    state.messageId = sentMessage.message_id;
    
    // Not waiting for prompt by default
    state.waitingForPrompt = false;
  } catch (error) {
    await handleSceneError(ctx, error, 'video');
  }
});

// Handle animate button (use default prompt)
videoScene.action('animate', async (ctx) => {
  await ctx.answerCbQuery();
  await processVideoGeneration(ctx, 'animation', VIDEO_GENERATION_PROMPT);
});

// Handle use prompt button
videoScene.action('use_prompt', async (ctx) => {
  await ctx.answerCbQuery();
  const state = ctx.scene.state as VideoSceneState;
  
  // Set state to wait for user prompt
  state.waitingForPrompt = true;
  
  // Ask user for prompt
  await ctx.reply(ctx.i18n.t('bot:video.enter_prompt'));
});

// Handle default prompt button (for backward compatibility)
videoScene.action('use_default_prompt', async (ctx) => {
  await ctx.answerCbQuery();
  await processVideoGeneration(ctx, 'animation', VIDEO_GENERATION_PROMPT);
});

// Handle text messages for custom prompts
videoScene.on('text', async (ctx, next) => {
  const state = ctx.scene.state as VideoSceneState;
  
  // If waiting for prompt, process as a prompt
  if (state.waitingForPrompt) {
    const userPrompt = ctx.message.text;
    
    // Process the prompt (translate if needed)
    const processedPrompt = await processPrompt(userPrompt);
    
    await processVideoGeneration(
      ctx, 
      'animation',
      processedPrompt.translatedPrompt,
      processedPrompt.originalPrompt,
      processedPrompt.isTranslated
    );
    return;
  }

  return next();
});

// Handle cancel button
videoScene.action('cancel', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(ctx.i18n.t('bot:video.cancelled'));
  return await exitScene(ctx);
});

// Handle back button - just delete the message and exit scene
videoScene.action('back', async (ctx) => {
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