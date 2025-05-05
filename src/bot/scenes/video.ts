import { Markup, Scenes } from 'telegraf';
import { MyContext } from '../../types/bot';
import { handleSceneError, exitScene } from '../../services/scene';
import { VideoSceneState } from '../../types/bot/scene.type';
import fs from 'fs';
import { prisma } from '../../utils/prisma';
import { GenerationStatus } from '@prisma/client';
import path from 'path';
import { addVideoGenerationJob } from '../../queues/videoQueue';
import { processPrompt } from '../../services/language';

// Create the video scene
export const videoScene = new Scenes.BaseScene<MyContext>('video');

// Cost of video generation in terms of regular generations
const VIDEO_GENERATION_COST = +process.env.VIDEO_GENERATION_COST || 5;

// Default prompt from environment variable
const VIDEO_GENERATION_PROMPT = "The character or characters simply look forward and move slightly. Their movements are orderly and restrained. They smile faintly. Camera fixed";

// Helper function to check if a file exists
const fileExists = (filePath: string): boolean => {
  try {
    const normalizedPath = path.normalize(filePath);
    return fs.existsSync(normalizedPath);
  } catch (error) {
    console.error(`Error checking file existence for ${filePath}:`, error);
    return false;
  }
};

// Helper function to ensure absolute path
const getAbsolutePath = (filePath: string): string => {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(process.cwd(), filePath);
};

// Scene enter handler
videoScene.enter(async (ctx) => {
  try {
    const userId = ctx.from.id.toString();
    const user = await ctx.prisma.user.findUnique({
      where: { telegramId: userId }
    });

    if (!user) {
      await ctx.reply(ctx.i18n.t('bot:video.user_not_found'));
      return await exitScene(ctx);
    }

    // Check if user has enough balance
    if (user.remainingGenerations < VIDEO_GENERATION_COST) {
      await ctx.reply(ctx.i18n.t('bot:video.insufficient_balance', { 
        cost: VIDEO_GENERATION_COST,
        balance: user.remainingGenerations
      }));
      return await exitScene(ctx);
    }

    // Get image path from scene state
    const state = ctx.scene.state as VideoSceneState;
    
    // Support both imagePath and imagePaths for backward compatibility
    let imagePath = state.imagePath;
    if (!imagePath && state.imagePaths && state.imagePaths.length > 0) {
      imagePath = state.imagePaths[0];
      state.imagePath = imagePath;
    }
    
    if (!imagePath) {
      await ctx.reply(ctx.i18n.t('bot:video.no_image'));
      return await exitScene(ctx);
    }
    
    // Validate image path
    if (!imagePath.startsWith('http') && !fileExists(getAbsolutePath(imagePath))) {
      await ctx.reply(ctx.i18n.t('bot:video.image_expired'));
      return await exitScene(ctx);
    }

    // Show image and prompt for video generation
    await ctx.replyWithPhoto(
      imagePath.startsWith('http') ? imagePath : { source: imagePath },
      {
        caption: ctx.i18n.t('bot:video.prompt_instructions', { 
          cost: VIDEO_GENERATION_COST
        }),
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(ctx.i18n.t('bot:video.use_default_prompt'), 'use_default_prompt')],
          [Markup.button.callback(ctx.i18n.t('bot:video.cancel_button'), 'cancel')]
        ])
      }
    );
    
    // Set scene state to wait for prompt
    state.waitingForPrompt = true;
  } catch (error) {
    await handleSceneError(ctx, error, 'video');
  }
});

// Handle default prompt button
videoScene.action('use_default_prompt', async (ctx) => {
  await ctx.answerCbQuery();
  const state = ctx.scene.state as VideoSceneState;
  
  await processVideoGeneration(ctx, VIDEO_GENERATION_PROMPT, false);
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
      processedPrompt.translatedPrompt,
      processedPrompt.isTranslated,
      processedPrompt.originalPrompt
    );
    return;
  }

  return next();
});

// Helper function to process video generation
async function processVideoGeneration(
  ctx: MyContext, 
  prompt: string, 
  isTranslated: boolean,
  originalPrompt?: string
) {
  const state = ctx.scene.state as VideoSceneState;
  
  if (!state.imagePath) {
    await ctx.reply(ctx.i18n.t('bot:video.image_expired'));
    return await exitScene(ctx);
  }
  
  // Show queued message
  const processingMsg = await ctx.reply(ctx.i18n.t('bot:video.queued'));
  
  // Deduct generations from user balance
  const userId = ctx.from.id.toString();
  const user = await prisma.user.findFirst({
    where: { telegramId: userId },
    select: {
      id: true,
    }
  });
  
  try {
    // Create a video generation record
    const videoGeneration = await prisma.generation.create({
      data: {
        userId: user.id,
        prompt,
        model: "video",
        seed: -1,
        width: 1024,
        height: 1024,
        batchSize: 1,
        imageUrls: [],
        status: GenerationStatus.PROCESSING,
      }
    });

    // Get user's preferred language
    const userLang = ctx.i18n.locale;

    // Add job to video queue
    await addVideoGenerationJob({
      userId: user.id,
      generationId: videoGeneration.id,
      imagePath: state.imagePath,
      prompt,
      translatedPrompt: originalPrompt || null,
      isTranslated,
      chatId: ctx.chat.id,
      messageId: processingMsg.message_id,
      language: userLang,
      effect: 'animation' // Default effect for backward compatibility
    });

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      ctx.i18n.t('bot:video.processing_queued')
    );
    
    return await exitScene(ctx);
  } catch (error) {
    // Refund the user's generations
    await ctx.prisma.user.update({
      where: { id: user.id },
      data: {
        remainingGenerations: {
          increment: VIDEO_GENERATION_COST
        }
      }
    });
    
    await ctx.reply(ctx.i18n.t('bot:video.generation_error'));
    return await exitScene(ctx);
  }
}

// Handle cancel button
videoScene.action('cancel', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(ctx.i18n.t('bot:video.cancelled'));
  return await exitScene(ctx);
});

// Handle back button
videoScene.action('back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply(ctx.i18n.t('bot:video.cancelled'));
  return await exitScene(ctx);
}); 