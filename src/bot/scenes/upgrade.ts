import { Markup, Scenes } from 'telegraf';
import { MyContext } from '../../types/bot';
import { handleSceneError, exitScene } from '../../services/scene';
import { UpgradeSceneState } from '../../types/bot/scene.type';
import fs from 'fs';
import { prisma } from '../../utils/prisma';
import { GenerationStatus } from '@prisma/client';
import path from 'path';
import { addUpgradeGenerationJob } from '../../queues/upgradeQueue';

// Create the upgrade scene
export const upgradeScene = new Scenes.BaseScene<MyContext>('upgrade');

// Cost of image upgrade in terms of regular generations
const IMAGE_UPGRADE_COST = +process.env.IMAGE_UPGRADE_COST || 1;

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
upgradeScene.enter(async ctx => {
  try {
    const userId = ctx.from.id.toString();
    const user = await ctx.prisma.user.findUnique({
      where: { telegramId: userId },
    });

    if (!user) {
      await ctx.reply(ctx.i18n.t('bot:upgrade.user_not_found'));
      return await exitScene(ctx);
    }

    // Check if user has enough balance
    if (user.remainingGenerations < IMAGE_UPGRADE_COST) {
      await ctx.reply(
        ctx.i18n.t('bot:upgrade.insufficient_balance', {
          cost: IMAGE_UPGRADE_COST,
          balance: user.remainingGenerations,
        }),
        { parse_mode: 'HTML' }
      );
      return await exitScene(ctx);
    }

    // Get image path from scene state
    const state = ctx.scene.state as UpgradeSceneState;

    // Support both imagePath and imagePaths for backward compatibility
    let imagePath = state.imagePath;
    if (!imagePath && state.imagePaths && state.imagePaths.length > 0) {
      // If no direct imagePath provided but we have imagePaths array, use the first one
      imagePath = state.imagePaths[0];
      // Save to state for later use
      state.imagePath = imagePath;
    }

    if (!imagePath) {
      await ctx.reply(ctx.i18n.t('bot:upgrade.no_image'));
      return await exitScene(ctx);
    }

    // Validate image path
    if (!imagePath.startsWith('http') && !fileExists(getAbsolutePath(imagePath))) {
      await ctx.reply(ctx.i18n.t('bot:upgrade.image_expired'));
      return await exitScene(ctx);
    }

    // Send confirmation message
    await ctx.replyWithPhoto(imagePath.startsWith('http') ? imagePath : { source: imagePath }, {
      caption: ctx.i18n.t('bot:upgrade.confirm_image', { cost: IMAGE_UPGRADE_COST }),
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback(ctx.i18n.t('bot:upgrade.confirm_button'), 'confirm_upgrade')],
        [Markup.button.callback(ctx.i18n.t('common.cancel'), 'cancel')],
      ]),
    });
  } catch (error) {
    console.error('Error in upgrade scene enter:', error);
    await handleSceneError(ctx, error, 'upgrade');
  }
});

// Handle upgrade confirmation
upgradeScene.action('confirm_upgrade', async ctx => {
  try {
    await ctx.answerCbQuery();
    const state = ctx.scene.state as UpgradeSceneState;

    // Support both imagePath and imagePaths for backward compatibility
    let imagePath = state.imagePath;
    if (!imagePath && state.imagePaths && state.imagePaths.length > 0) {
      // If no direct imagePath provided but we have imagePaths array, use the first one
      imagePath = state.imagePaths[0];
      // Save to state for later use
      state.imagePath = imagePath;
    }

    // If no image is available, exit
    if (!imagePath) {
      await ctx.reply(ctx.i18n.t('bot:upgrade.image_expired'));
      return await exitScene(ctx);
    }

    // Show queued message
    const processingMsg = await ctx.reply(ctx.i18n.t('bot:upgrade.queued'));

    // Deduct generations from user balance
    const userId = ctx.from.id.toString();
    const user = await prisma.user.findFirst({
      where: { telegramId: userId },
      select: {
        id: true,
      },
    });

    try {
      // Create an image upgrade generation record
      const upgradeGeneration = await prisma.generation.create({
        data: {
          userId: user.id,
          prompt: 'Enhance image quality', // Hardcoded prompt as requested
          model: 'upgrade', // Hardcoded model as requested
          seed: -1, // Random seed
          width: 1024, // Default width
          height: 1024, // Default height
          batchSize: 1, // Just one image
          imageUrls: [], // Will be updated when enhancement is ready
          status: GenerationStatus.PROCESSING,
        },
      });

      // Get user's preferred language
      const userLang = ctx.i18n.locale;

      // Add job to upgrade queue
      await addUpgradeGenerationJob({
        userId: user.id,
        generationId: upgradeGeneration.id,
        imagePath,
        chatId: ctx.chat.id,
        messageId: processingMsg.message_id,
        language: userLang,
      });

      // Notify user that the task is queued
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        processingMsg.message_id,
        undefined,
        ctx.i18n.t('bot:upgrade.processing_queued')
      );

      // Exit scene - enhanced image will be sent by the worker when ready
      return await exitScene(ctx);
    } catch (error) {
      console.error('Image upgrade error:', error);

      // Refund the user's generations
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: {
          remainingGenerations: {
            increment: IMAGE_UPGRADE_COST,
          },
        },
      });

      await ctx.reply(ctx.i18n.t('bot:upgrade.upgrade_error'));
      return await exitScene(ctx);
    }
  } catch (error) {
    console.error('Error in upgrade confirmation:', error);
    await handleSceneError(ctx, error, 'upgrade');
  }
});

// Handle cancel button
upgradeScene.action('cancel', async ctx => {
  await ctx.answerCbQuery();
  await ctx.reply(ctx.i18n.t('bot:upgrade.cancelled'));
  return await exitScene(ctx);
});

// Handle back button
upgradeScene.action('back', async ctx => {
  await ctx.answerCbQuery();
  await ctx.reply(ctx.i18n.t('bot:upgrade.cancelled'));
  return await exitScene(ctx);
});
