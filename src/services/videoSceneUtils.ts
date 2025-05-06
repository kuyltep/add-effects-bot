import { MyContext } from '../types/bot';
import { VideoSceneState } from '../types/bot/scene.type';
import fs from 'fs';
import path from 'path';
import { prisma } from '../utils/prisma';
import { GenerationStatus } from '@prisma/client';
import { exitScene } from './scene';
import { addVideoGenerationJob } from '../queues/videoQueue';

// Video generation cost from environment variable
export const VIDEO_GENERATION_COST = +process.env.VIDEO_GENERATION_COST || 5;

/**
 * Checks if a file exists
 * @param filePath Path to the file
 * @returns boolean indicating if file exists
 */
export const fileExists = (filePath: string): boolean => {
  try {
    const normalizedPath = path.normalize(filePath);
    return fs.existsSync(normalizedPath);
  } catch (error) {
    console.error(`Error checking file existence for ${filePath}:`, error);
    return false;
  }
};

/**
 * Gets absolute path for a file
 * @param filePath Relative or absolute path
 * @returns Absolute path
 */
export const getAbsolutePath = (filePath: string): string => {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.join(process.cwd(), filePath);
};

/**
 * Validates if a user can generate a video
 * @param ctx Telegram context
 * @returns User object if valid, null otherwise
 */
export const validateUser = async (ctx: MyContext) => {
  const userId = ctx.from.id.toString();
  const user = await ctx.prisma.user.findUnique({
    where: { telegramId: userId }
  });

  if (!user) {
    await ctx.reply(ctx.i18n.t('bot:video.user_not_found'));
    return null;
  }

  // Check if user has enough balance
  if (user.remainingGenerations < VIDEO_GENERATION_COST) {
    await ctx.reply(ctx.i18n.t('bot:video.insufficient_balance', { 
      cost: VIDEO_GENERATION_COST,
      balance: user.remainingGenerations
    }));
    return null;
  }

  return user;
};

/**
 * Validates and resolves image path from scene state
 * @param ctx Telegram context
 * @param state Video scene state
 * @returns Resolved image path or null if invalid
 */
export const resolveImagePath = async (ctx: MyContext, state: VideoSceneState): Promise<string | null> => {
  // Support both imagePath and imagePaths for backward compatibility
  let imagePath = state.imagePath;
  if (!imagePath && state.imagePaths && state.imagePaths.length > 0) {
    imagePath = state.imagePaths[0];
    state.imagePath = imagePath;
  }
  
  if (!imagePath) {
    await ctx.reply(ctx.i18n.t('bot:video.no_images'));
    return null;
  }
  
  // Validate image path
  if (!imagePath.startsWith('http') && !fileExists(getAbsolutePath(imagePath))) {
    await ctx.reply(ctx.i18n.t('bot:video.image_expired'));
    return null;
  }

  return imagePath;
};

/**
 * Processes a video generation with the specified effect
 * @param ctx Telegram context
 * @param effect Effect type to apply
 * @param prompt Prompt for the video generation
 */
export const processVideoGeneration = async (
  ctx: MyContext,
  effect: string,
  prompt: string,
  translatedPrompt: string | null = null,
  isTranslated: boolean = false,
): Promise<void> => {
  const state = ctx.scene.state as VideoSceneState;
  
  if (!state.imagePath) {
    await ctx.reply(ctx.i18n.t('bot:video.image_expired'));
    return await exitScene(ctx);
  }
  
  // Show queued message
  const processingMsg = await ctx.reply(ctx.i18n.t('bot:video.queued'));
  
  // Get user ID
  const userId = ctx.from.id.toString();
  const user = await prisma.user.findFirst({
    where: { telegramId: userId },
    select: { id: true }
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
      translatedPrompt: translatedPrompt,
      isTranslated,
      chatId: ctx.chat.id,
      messageId: processingMsg.message_id,
      language: userLang,
      effect
    });

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      processingMsg.message_id,
      undefined,
      ctx.i18n.t('bot:video.processing_queued')
    );
    
    return await exitScene(ctx);
  } catch (error) {
    console.error('Video generation error:', error);
    
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
}; 