import { Telegraf, Markup, Context, Scenes, session } from 'telegraf';
import { generateScene } from './scenes/generate';
import { settingsScene } from './scenes/settings';
import { startScene } from './scenes/start';
import { balanceScene } from './scenes/balance';
import { referralScene } from './scenes/referral';
import { helpScene } from './scenes/help';
import { linksScene } from './scenes/links';
import { packagesScene } from './scenes/subscription';
import { paymentScene } from './scenes/payment';
import { videoScene } from './scenes/video';
import { upgradeScene } from './scenes/upgrade';
import { supportMenuScene } from './scenes/supportMenu';
import { MyContext } from './types';
import { prisma } from '../utils/prisma';
import { i18nMiddleware } from './middleware/i18n';
import { checkBannedUser } from './middleware/check-banned';
import { createRedisConnection, createRedisSubscriber, createRedisPublisher } from '../utils/redis';
import fs from 'fs';
import i18next from 'i18next';
import { createMainKeyboardMiddleware } from '../utils/sceneHelpers';
import path from 'path';
import fetch from 'node-fetch';
import { checkChannelSubscription } from './middleware/check-subscription';

// Создаем инстанс бота
export const bot = new Telegraf<MyContext>(process.env.TELEGRAM_BOT_TOKEN || '');

// Get all scenes
const scenes = [
  generateScene, 
  settingsScene,
  startScene,
  balanceScene,
  referralScene,
  helpScene,
  linksScene,
  packagesScene,
  paymentScene,
  videoScene,
  upgradeScene,
  supportMenuScene
];

// Создаем менеджер сцен
const stage = new Scenes.Stage<MyContext>(scenes as any);

// Add the main keyboard middleware at the stage level
// This ensures it will intercept all scene messages without causing infinite loops
stage.use(createMainKeyboardMiddleware());

// Устанавливаем middleware
bot.use(session({
  // Make sure the session persists properly between updates
  property: 'session',
  getSessionKey: (ctx) => {
    // Get a unique session key based on the Telegram user ID to persist state
    const userId = ctx.from?.id;
    return userId ? `user:${userId}` : undefined;
  }
}));
bot.use(i18nMiddleware()); // Use our custom i18n middleware
bot.use(checkBannedUser); // Add banned user check middleware
bot.use(stage.middleware());
bot.use((ctx, next) => {
  // Добавляем объект prisma в контекст
  ctx.prisma = prisma;
  return next();
});
bot.use(checkChannelSubscription);

// Add global error handler to prevent bot crashes
bot.catch((err, ctx) => {
  const userId = ctx.from?.id || 'unknown';
  const chatId = ctx.chat?.id || 'unknown';
  
  // Check if error is a TelegramError with description
  if (typeof err === 'object' && err !== null && 'description' in err && typeof err.description === 'string' && (
    err.description.includes('bot was blocked by the user') || 
    err.description.includes('user is deactivated') || 
    err.description.includes('chat not found'))
  ) {
    console.warn(`Bot blocked or chat unavailable - User: ${userId}, Chat: ${chatId}`);
  } else {
    console.error(`Unhandled bot error for User: ${userId}, Chat: ${chatId}:`, err);
  }
  
  // Don't crash, swallow the error but log it
});

// Redis instances
let redisSubscriber;
let redisPublisher;
let redisConnection;

// Setup message handlers for Redis pub/sub
function setupRedisSubscriber() {
  // Subscribe to channels
  redisSubscriber.subscribe(
    'bot:status_update',
    'bot:delete_message',
    'bot:download_file',
    'bot:send_video',
    'bot:send_document',
    'bot:crease_error_choice',
    'bot:payment_success',
    'bot:send_effect'
  );
  
  // Handle messages
  redisSubscriber.on('message', async (channel, message) => {
    try {
      const data = JSON.parse(message);
      
      switch (channel) {
        case 'bot:status_update':
          // Update status message
          if (data.text && data.text !== 'undefined') {
            await bot.telegram.editMessageText(
              data.chatId,
              data.messageId,
              undefined,
              data.text,
              { parse_mode: data.parseMode || 'HTML' }
            );
          } else {
            console.warn('Received status update with undefined text, skipping message edit');
          }
          break;
          
        case 'bot:delete_message':
          // Delete a message
          try {
            await bot.telegram.deleteMessage(data.chatId, data.messageId);
          } catch (error) {
            console.error('Error deleting message:', error);
          }
          break;
          
        case 'bot:download_file':
          // Download a file from Telegram
          try {
            const { fileId, downloadPath } = data;
            if (!fileId || !downloadPath) {
              console.error('Missing fileId or downloadPath in download_file request');
              return;
            }
            
            
            // Get file link from Telegram
            const fileLink = await bot.telegram.getFileLink(fileId);
            if (!fileLink) {
              console.error(`Failed to get file link for ${fileId}`);
              return;
            }
            
            // Download the file - handle both string and object with href
            const fileUrl = typeof fileLink === 'string' ? fileLink : fileLink.href;
            
            const response = await fetch(fileUrl);
            if (!response.ok) {
              throw new Error(`Failed to download file: ${response.statusText}`);
            }
            
            // Ensure directory exists
            const downloadDir = path.dirname(downloadPath);
            if (!fs.existsSync(downloadDir)) {
              fs.mkdirSync(downloadDir, { recursive: true });
            }
            
            // Save file to disk
            const fileBuffer = await response.arrayBuffer();
            fs.writeFileSync(downloadPath, Buffer.from(fileBuffer));
            
            console.log(`File downloaded successfully to ${downloadPath} (${fileBuffer.byteLength} bytes)`);
          } catch (error) {
            console.error('Error downloading file:', error);
          }
          break;
          
        case 'bot:send_video':
          // Send video to user
          await sendVideoToUser(data);
          break;

        case 'bot:send_document':
          // Send document to user
          await sendDocumentToUser(data);
          break;

        case 'bot:payment_success':
          // Handle payment success notification
          await sendPaymentSuccessNotification(data);
          break;
          
        case 'bot:send_effect':
          // Send effect results to user
          await sendEffectResults(data);
          break;
      }
    } catch (error) {
      console.error('Error handling Redis message:', error, 'on channel:', channel);
    }
  });
  
  // Handle connection errors
  redisSubscriber.on('error', (error) => {
    console.error('Redis subscriber error:', error);
  });
  
  console.log('Redis subscriber initialized for bot-worker communication');
}

// Function to send video to user
async function sendVideoToUser(data) {
  try {
    const { chatId, videoUrl, caption } = data;
    
    if (!chatId || !videoUrl) {
      console.error('Missing required data for sending video');
      return;
    }
    
    
    // Send the video with caption
    if (videoUrl.startsWith('http')) {
      // If URL, send directly
    await bot.telegram.sendVideo(chatId, videoUrl, {
      caption: caption,
      parse_mode: 'HTML'
    });
    } else if (fs.existsSync(videoUrl)) {
      // If local file, send from disk
      await bot.telegram.sendVideo(chatId, { source: videoUrl }, {
        caption: caption,
        parse_mode: 'HTML'
      });
    } else {
      throw new Error(`Video file not found: ${videoUrl}`);
    }
    
  } catch (error) {
    console.error('Error sending video to user:', error);
    
    try {
      if (data.chatId) {
        await bot.telegram.sendMessage(
          data.chatId,
          '❌ Error sending video. Please try again later.',
          { parse_mode: 'HTML' }
        );
      }
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }
  }
}


// Function to send document to user
async function sendDocumentToUser(data) {
  try {
    const { chatId, documentUrl, caption, isUpgrade } = data;
    
    if (!chatId || !documentUrl) {
      console.error('Missing required data for sending document');
      return;
    }
    
    
    // Send the document with caption
    if (documentUrl.startsWith('http')) {
      // If URL, send directly
    await bot.telegram.sendDocument(chatId, documentUrl, {
      caption: caption,
      parse_mode: 'HTML',
    });
    } else if (fs.existsSync(documentUrl)) {
      // If local file, send from disk
      await bot.telegram.sendDocument(chatId, { source: documentUrl }, {
        caption: caption,
        parse_mode: 'HTML',
      });
    } else {
      throw new Error(`Document file not found: ${documentUrl}`);
    }
    
  } catch (error) {
    console.error('Error sending document to user:', error);
    
    try {
      if (data.chatId) {
        await bot.telegram.sendMessage(
          data.chatId,
          i18next.t('bot:generate.error', { lng: data.language, supportUsername: process.env.SUPPORT_USERNAME }),
          { parse_mode: 'HTML' }
        );
      }
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }
  }
}

// Function to send payment success notification to user
async function sendPaymentSuccessNotification(data: { 
  telegramId: string;
  generationsAdded: number;
  amount: number;
}) {
  try {
    if (!data.telegramId) {
      console.error('Missing telegramId in payment success data');
      return;
    }

    // Get user with settings to determine language
    const user = await prisma.user.findFirst({
      where: { telegramId: data.telegramId },
      include: { settings: true }
    });
    
    // Default to Russian if no language preference found
    const language = user?.settings?.language?.toLowerCase() || 'ru';
    
    // Send payment success message
    await bot.telegram.sendMessage(
      data.telegramId,
      i18next.t('bot:payments.success', { 
        lng: language,
        count: data.generationsAdded,
        amount: data.amount
      }),
      { 
        parse_mode: 'HTML',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(i18next.t('bot:buttons.generate_now', { lng: language }), 'generate_more')]
        ]).reply_markup
      }
    );
    
    console.log(`Payment success notification sent to user ${data.telegramId}`);
  } catch (error) {
    console.error('Error sending payment success notification:', error);
  }
}

// Function to send effect results via bot
async function sendEffectResults(data) {
  const chatId = data?.chatId;
  const { 
    imageData,
    userId,
    language,
    referralCode,
    generationId,
    effect
  } = data;
  try {

    
    if (!chatId || !imageData) {
      console.error('Missing chatId or imageData in effect results data');
      return;
    }

    
    // Check if the image path is a URL or local file
    const imagePath = imageData.path;
    const isUrl = imageData.isUrl || (typeof imagePath === 'string' && imagePath.startsWith('http'));

    // Get localized completion message
    const completionMessage = i18next.t('bot:generate.completed', { 
      lng: language
    });
    
    // Add watermark text
    const watermarkText = i18next.t('bot:generate.watermark', { 
      botUsername: process.env.BOT_USERNAME,
      lng: language,
      referralCode
    });
    
    // Send the effect image with caption
    console.log(`Sending effect image to chat ${chatId}: ${imagePath} (isUrl: ${isUrl})`);
    
    try {
      if (isUrl) {
        // Use URL directly for remote images
        await bot.telegram.sendPhoto(
          chatId, 
          imagePath, 
          {
            caption: `${completionMessage}\n\n${watermarkText}`,
            parse_mode: 'HTML'
          }
        );
      } else if (fs.existsSync(imagePath)) {
        // Use local file if it exists
        await bot.telegram.sendPhoto(
          chatId, 
          { source: imagePath }, 
          {
            caption: `${completionMessage}\n\n${watermarkText}`,
            parse_mode: 'HTML'
          }
        );
      } else {
        throw new Error(`Image not found: ${imagePath}`);
      }
    } catch (photoError) {
      console.error('Error sending photo:', photoError);
      await bot.telegram.sendMessage(
        chatId,
        'Could not send the processed photo, but the effect was applied. Please try again.',
        { parse_mode: 'HTML' }
      );
    }
    

    // Also send the full-size file as document
    try {
      if (isUrl) {
        await bot.telegram.sendDocument(
          chatId, 
          imagePath, 
          {
            caption: i18next.t('bot:generate.documents_message', { lng: language }),
            parse_mode: 'HTML'
          }
        );
      } else if (fs.existsSync(imagePath)) {
        await bot.telegram.sendDocument(
          chatId, 
          { source: imagePath }, 
          {
            caption: i18next.t('bot:generate.documents_message', { lng: language }),
            parse_mode: 'HTML'
          }
        );
      }
    } catch (docError) {
      console.error('Error sending document:', docError);
      // Continue even if document send fails
    }
    

    // Get the user's remaining restorations
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { remainingGenerations: true }
    });
      
    if (user) {
      // Send remaining generations info with buttons
      const remainingGenerationsText = i18next.t('bot:generate.remainingGenerations', {
        lng: language,
        count: user.remainingGenerations
      });
      
      // Create a keyboard with generation info
      const generateMoreText = i18next.t('bot:buttons.generate_more', { lng: language });
      const inviteFriendsText = i18next.t('bot:buttons.invite_friend', { lng: language });
      const generateVideoText = i18next.t('bot:buttons.generate_video', { lng: language });
      const upgradeImageText = i18next.t('bot:buttons.upgrade_image', { lng: language });
      
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback(generateMoreText, 'generate_more'),
          Markup.button.callback(inviteFriendsText, 'invite_friend')
        ],
        [
          Markup.button.callback(generateVideoText, 'generate_video'),
          Markup.button.callback(upgradeImageText, 'upgrade_image')
        ]
      ]);
      
      await bot.telegram.sendMessage(chatId, remainingGenerationsText, keyboard);
    }
  } catch (error) {
    console.error('Error sending effect results:', error);
    try {
      if (chatId) {
        // Send error message as fallback
        await bot.telegram.sendMessage(
          chatId, 
          i18next.t('bot:generate.error', { lng: language, supportUsername: process.env.SUPPORT_USERNAME }),
          { parse_mode: 'HTML' }
        );
      }
    } catch (sendError) {
      console.error('Failed to send error message:', sendError);
    }
  }
}

export async function stopBot() {
  console.log('Stopping bot...');
  // Ensure Redis subscriber exists before trying to unsubscribe and quit
  if (redisSubscriber) {
    try {
      await redisSubscriber.unsubscribe();
      await redisSubscriber.quit();
      console.log('Redis subscriber disconnected');
    } catch (error) {
      console.error('Error disconnecting Redis subscriber:', error);
    }
  }

  // Ensure Redis publisher exists before trying to quit
  if (redisPublisher) {
    try {
      await redisPublisher.quit();
      console.log('Redis publisher disconnected');
    } catch (error) {
      console.error('Error disconnecting Redis publisher:', error);
    }
  }

  // Ensure Redis connection exists before trying to quit
  if (redisConnection) {
    try {
      await redisConnection.quit();
      console.log('Redis connection disconnected');
    } catch (error) {
      console.error('Error disconnecting Redis connection:', error);
    }
  }

  // Stop the bot instance
  bot.stop();
  console.log('Bot stopped.');
}

// Function to generate the main keyboard layout based on locale
// export function getMainKeyboard(locale: string = 'ru') {
//   // Ensure locale exists in i18next resources
//   const currentLocale = i18next.exists(locale) ? locale : 'ru';
  
//   return Markup.keyboard([
//     [
//       Markup.button.text(i18next.t('bot:menu.generate', { lng: currentLocale })),
//       Markup.button.text(i18next.t('bot:menu.balance', { lng: currentLocale }))
//     ],
//     [
//       Markup.button.text(i18next.t('bot:menu.subscription', { lng: currentLocale })),
//       Markup.button.text(i18next.t('bot:menu.referral', { lng: currentLocale })),
//       Markup.button.text(i18next.t('bot:menu.settings', { lng: currentLocale }))
//     ],
//     [Markup.button.text(i18next.t('bot:menu.help', { lng: currentLocale }))]
//   ]).resize();
// }

export async function startBot() {
  try {
    // Initialize Redis clients
    redisSubscriber = createRedisSubscriber();
    redisPublisher = createRedisPublisher();
    redisConnection = createRedisConnection();
    setupRedisSubscriber();
    
    // Command handlers
    bot.command('start', async (ctx) => await ctx.scene.enter('start'));
    bot.command('generate', async (ctx) => await ctx.scene.enter('generate'));
    bot.command('settings', async (ctx) => await ctx.scene.enter('settings'));
    bot.command('balance', async (ctx) => await ctx.scene.enter('balance'));
    bot.command('referral', async (ctx) => await ctx.scene.enter('referral'));
    bot.command('help', async (ctx) => await ctx.scene.enter('help'));
    bot.command('links', async (ctx) => await ctx.scene.enter('links'));
    bot.command('packages', async (ctx) => await ctx.scene.enter('packages'));
    bot.command('video', async (ctx) => await ctx.scene.enter('video'));
    bot.command('upgrade', async (ctx) => await ctx.scene.enter('upgrade'));
    
    // Добавляем обработчик для кнопки создания еще
    bot.action('generate_more', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.scene.enter('generate');
    });
    
    // Добавляем обработчик для кнопки приглашения друга
    bot.action('invite_friend', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.scene.enter('referral');
    });
    
    // Добавляем обработчик для кнопки создания видео
    bot.action('generate_video', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.scene.enter('video');
    });
    
    // Добавляем обработчик для кнопки улучшения изображения
    bot.action('upgrade_image', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.scene.enter('upgrade');
    });
    
    // Добавляем обработчик для кнопки покупки генераций
    bot.action('buy_generations', async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.scene.enter('packages');
    });
    
      await bot.launch();

    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Start the bot' },
      { command: 'referral', description: 'Referral program' },
      { command: 'balance', description: 'Check your balance' },
      { command: 'generate', description: 'Generate a new photo' },
      { command: 'settings', description: 'Bot settings' },
      { command: 'help', description: 'How to use the bot' },
      { command: 'packages', description: 'Buy restoration packages' },
      { command: 'video', description: 'Generate video from restored photo' },
      { command: 'upgrade', description: 'Enhance photo quality' }
    ]);
  } catch (error) {
    console.error('Error starting Telegram bot:', error);
    throw error;
  }
}
