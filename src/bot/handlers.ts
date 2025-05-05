import { bot } from './core';
import { message } from 'telegraf/filters';
import { canUserGenerate } from '../services/generation';
import { findUserByTelegramId } from '../services/user';
import fs from 'fs';
import { GenerationStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { MyContext } from 'src/types/bot';
import { checkChannelSubscriptionLogic } from './middleware/check-subscription';


// Команда /start - начало работы с ботом
export function setupStartCommand() {
  bot.start(async ctx => {
    return ctx.scene.enter('start');
  });
}

// Команда /referral - реферальная программа
export function setupReferralCommand() {
  bot.command('referral', async ctx => {
    return ctx.scene.enter('referral');
  });
}

// Команда /balance - баланс и подписка
export function setupBalanceCommand() {
  bot.command('balance', async ctx => {
    return ctx.scene.enter('balance');
  });
}

// Команда /packages - покупка генераций
export function setupPackagesCommand() {
  bot.command('packages', async ctx => {
    return ctx.scene.enter('packages');
  });
}

// Команда /generate - генерация изображения
export function setupGenerateCommand() {
  // Create a middleware function that can be reused
  const generateMiddleware = async (ctx) => {
    try {
      // Get user info
      const telegramId = ctx.from?.id.toString() || '';
      const user = await findUserByTelegramId(telegramId);
      
      if (!user) {
        await ctx.reply(ctx.i18n.t('bot:errors.not_registered'));
        return false;
      }
      
      // Check if user can generate images
      const canGenerate = await canUserGenerate(ctx, user);
      
      if (!canGenerate) {
        // The canUserGenerate function will already handle sending messages
        return false;
      }
      
      // Enter the generate scene - welcome message will be sent by the scene itself
      await ctx.scene.enter('generate');
      return true;
    } catch (error) {
      console.error('Error handling generation:', error);
      await ctx.reply('An error occurred while starting generation.');
      return false;
    }
  };

  // Register the command
  bot.command('generate', generateMiddleware);
  
  // Export the middleware for use elsewhere
  return generateMiddleware;
}

// Команда /settings - настройки -> теперь меню помощи
export function setupSettingsCommand() {
  bot.command('settings', async ctx => {
    return ctx.scene.enter('supportMenu');
  });
}

export function setupCheckSubscriptionCommand() {
  // Add callback handler for subscription check button
  bot.action('check_subscription', async (ctx) => {
    await ctx.answerCbQuery();
    await checkChannelSubscriptionLogic(ctx, true);
  });
}

// Команда /help - помощь
export function setupHelpCommand() {
  bot.command('help', async ctx => {
    return ctx.scene.enter('help');
  });
}

async function videoHandler(ctx: MyContext) {
  try {
    // Get user info
    const telegramId = ctx.from?.id.toString() || '';
    const user = await findUserByTelegramId(telegramId);
    
    if (!user) {
      await ctx.reply(ctx.i18n.t('bot:errors.not_registered'));
      return false;
    }
    
    // Check if user has recent generations
    const lastGeneration = await prisma.generation.findFirst({
      where: { 
        userId: user.id,
        status: GenerationStatus.COMPLETED,
        imageUrls: {
          isEmpty: false
        },
        model: {
          not: "video"
        }
      },
      orderBy: { 
        createdAt: 'desc' 
      }
    });
    
    if (!lastGeneration) {
      return ctx.reply(ctx.i18n.t('bot:video.no_recent_generations'));
    }
    
    // Get image paths from the last generation
    const imagePaths = lastGeneration.imageUrls.filter(url => url.startsWith('https://') || fs.existsSync(url));
    
    // Check if there are valid image paths
    if (!imagePaths || imagePaths.length === 0) {
      return ctx.reply(ctx.i18n.t('bot:video.no_images_found'));
    }
    
    // Enter the video scene with the first image path
    await ctx.scene.enter('video', { imagePath: imagePaths[0] });
    return true;
  } catch (error) {
    console.error('Error handling video command:', error);
    await ctx.reply(ctx.i18n.t('bot:errors.general'));
    return false;
  }
}

// Команда /video - генерация видео из изображений
export function setupVideoCommand() {
  bot.command('video', async ctx => {
    await videoHandler(ctx);
  });
}

// Обработка кнопок клавиатуры
export function setupKeyboardHandlers() {
  bot.on(message('text'), async (ctx, next) => {
    // Skip if we're in a scene
    if (ctx.scene?.current) {
      return next();
    }

    const text = ctx.message.text;
    // Ensure locale is set, default to 'ru' if not
    const locale = ctx.i18n?.locale?.toLowerCase() || 'ru';

    // Map scene names to their corresponding i18n keys
    const sceneKeyMap: { [key: string]: string } = {
      // Note: The scene name for restore is 'generate'
      generate: 'bot:keyboard.generate',
      balance: 'bot:keyboard.balance',
      referral: 'bot:keyboard.referral',
      supportMenu: 'bot:keyboard.support_menu',
      settings: 'bot:keyboard.settings',
    };

    let targetScene: string | null = null;

    // Check if the received text matches any localized button text
    for (const sceneName in sceneKeyMap) {
      // Get the expected localized text for the button
      const expectedText = ctx.i18n.t(sceneKeyMap[sceneName], { lng: locale });
      if (text === expectedText) {
        targetScene = sceneName;
        break;
      }
    }

    if (targetScene) {
      console.log(`Entering ${targetScene} scene via keyboard button (locale: ${locale})`);
      // Always clear the current scene to prevent stacking
      await ctx.scene.leave();
      // Enter the appropriate scene
      return ctx.scene.enter(targetScene);
    }

    // If text doesn't match any known keyboard button, let other handlers process it
    return next();
  });
}

// Обработка колбеков для покупки генераций
export function setupPackageCallbacks() {
  bot.action('buy_generations', async ctx => {
    await ctx.answerCbQuery();
    return ctx.scene.enter('packages');
  });

  // Обработка выбора пакета генераций
  bot.action(/package_(package1|package2|package3|package4)/, async ctx => {
    await ctx.answerCbQuery();
    const packageType = ctx.match[1];
    
    // Store the package type in scene state
    ctx.scene.state.packageType = packageType;
    return ctx.scene.enter('payment', { packageType });
  });
}

// Обработка колбеков генерации
export function setupGenerationCallbacks() {
  // Store reference to generate middleware
  const generateMiddleware = setupGenerateCommand();
  
  // Generate more action
  bot.action('generate_more', async (ctx) => {
    try {
      // Answer callback query silently
      try {
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Error answering callback query:', error);
      }
      
      // Instead of manually checking user and permissions, reuse the generate middleware
      return generateMiddleware(ctx);
      
    } catch (error) {
      console.error('Error in generate_more action:', error);
      // Send generic error message if possible
      try {
        await ctx.reply(ctx.i18n.t('bot:errors.general'));
      } catch (replyError) {
        console.error('Error sending error message:', replyError);
      }
    }
  });
  
  // Invite friend action
  bot.action('invite_friend', async ctx => {
    try {
      // Answer callback query silently
      try {
        await ctx.answerCbQuery();
      } catch (error) {
        console.error('Error answering callback query:', error);
      }
      
      // Enter referral scene
      return ctx.scene.enter('referral');
      
    } catch (error) {
      console.error('Error in invite_friend action:', error);
      // Send generic error message if possible
      try {
        await ctx.reply(ctx.i18n.t('bot:errors.general'));
      } catch (replyError) {
        console.error('Error sending error message:', replyError);
      }
    }
  });
}

// Setup generate video button callback
export function setupVideoCallbacks() {
  bot.action('generate_video', async ctx => {
    await videoHandler(ctx);
  });
}

// Make the function generic to handle both command and callback contexts
async function upgradeHandler(ctx: MyContext) {
  try {
    // Get user info
    const telegramId = ctx.from?.id.toString() || '';
    const user = await findUserByTelegramId(telegramId);
    
    if (!user) {
      await ctx.reply(ctx.i18n.t('bot:errors.not_registered'));
      return false;
    }
    
    // Check if user has recent generations
    const lastGeneration = await prisma.generation.findFirst({
      where: { 
        userId: user.id,
        status: GenerationStatus.COMPLETED,
        imageUrls: {
          isEmpty: false
        },
        model: {
          not: {
            in: ["video", "upgrade"]
          }
        }
      },
      orderBy: { 
        createdAt: 'desc' 
      }
    });
    
    if (!lastGeneration) {
      return ctx.reply(ctx.i18n.t('bot:upgrade.no_recent_generations'));
    }
    
    // Get image paths from the last generation
    const imagePaths = lastGeneration.imageUrls.filter(url => url.startsWith('https://') || fs.existsSync(url));
    
    // Check if there are valid image paths
    if (!imagePaths || imagePaths.length === 0) {
      return ctx.reply(ctx.i18n.t('bot:upgrade.no_images_found'));
    }
    
    // Enter the upgrade scene with the first image path
    await ctx.scene.enter('upgrade', { imagePath: imagePaths[0] });
    return true;
  } catch (error) {
    console.error('Error handling upgrade command:', error);
    await ctx.reply(ctx.i18n.t('bot:errors.general'));
    return false;
  }
}
// Setup upgrade image button callback
export function setupUpgradeCallbacks() {
  bot.action('upgrade_image', async ctx => {
    await upgradeHandler(ctx);
  });
}

// Setup command for upgrade
export function setupUpgradeCommand() {
  bot.command('upgrade', async ctx => {
    await upgradeHandler(ctx);
  });
}

// Регистрация всех обработчиков
export function setupAllHandlers() {
  setupStartCommand();
  setupReferralCommand();
  setupBalanceCommand();
  setupGenerateCommand();
  setupSettingsCommand();
  setupHelpCommand();
  setupPackagesCommand();
  setupKeyboardHandlers();
  setupPackageCallbacks();
  setupGenerationCallbacks();
  setupVideoCommand();
  setupVideoCallbacks();
  setupUpgradeCommand();
  setupUpgradeCallbacks();
  setupCheckSubscriptionCommand();
}
