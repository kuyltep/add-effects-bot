import { GenerationStatus } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../utils/prisma';
import { MyContext, GenerateWizardState } from '../types';
import { Logger } from '../utils/rollbar.logger';

/**
 * Interface for image generation parameters
 */
export interface GenerationParams {
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  width?: number;
  height?: number;
  batchSize?: number;
  model?: string;
  outputFolder?: string;
  userId?: string;
  telegramId?: string;
  chatId?: string;
  messageId?: number;
  language?: string;
  subscriptionActive?: boolean;
  generationId?: string;
  translatedPrompt?: string;
}

/**
 * Interface for generated image result
 */
export interface GeneratedImage {
  path: string;
  size: number;
}



/**
 * Initialize the Reve SDK client
 */







/**
 * Ensure a directory exists
 */
function ensureDirectoryExists(directory: string) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

/**
 * Extract base64 data from image URL
 */
function extractBase64Data(base64Image: string): string {
  return base64Image.includes('base64,')
    ? base64Image.split('base64,')[1]
    : base64Image;
}

/**
 * Apply watermark to an image
 * Places a 100x100px watermark in the right bottom corner of the image
 */
async function applyWatermark(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const image = sharp(imageBuffer);
    
    // Create watermark logo
    const logoSize = 100; // 100x100 pixels
    const logoBuffer = await createWatermarkLogo(logoSize);
    
    // Apply watermark to bottom right corner with 10px padding
    return await image
      .composite([
        {
          input: logoBuffer,
          gravity: 'southeast', // bottom-right corner
          left: 10, 
          top: 10,
        },
      ])
      .toBuffer();
  } catch (error) {
    // Return original buffer if watermarking fails
    return imageBuffer;
  }
}

/**
 * Create a watermark logo image
 */
async function createWatermarkLogo(size: number): Promise<Buffer> {
  // Create a simple watermark with the text and transparent background
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.4)" rx="10" ry="10" />
      <text 
        x="50%" 
        y="50%" 
        font-family="Arial, sans-serif" 
        font-weight="bold"
        font-size="14" 
        fill="white" 
        text-anchor="middle" 
        alignment-baseline="middle">
        Reve AI
      </text>
    </svg>
  `;
  
  return await sharp(Buffer.from(svg)).resize(size, size).toBuffer();
}

/**
 * Validates if the prompt meets minimum requirements
 * @param prompt The user's prompt text
 * @returns Boolean indicating if prompt is valid
 */
export function isValidPrompt(prompt: string): boolean {
  return prompt.length >= 3;
}

/**
 * Validates and parses seed input
 * @param input The seed input string
 * @returns The parsed seed value (-1 for random)
 */
export function parseSeedInput(input: string): number {
  if (input.toLowerCase() === 'random' || input.toLowerCase() === 'skip') {
    return -1;
  }
  
  const seedNumber = parseInt(input);
  if (isNaN(seedNumber) || seedNumber <= 0) {
    throw new Error('invalid_seed');
  }
  
  return seedNumber;
}

/**
 * Validates batch size input
 * @param input The batch size input string
 * @returns The parsed batch size value
 */
export function validateBatchSize(input: string): number {
  const batchSize = parseInt(input);
  if (isNaN(batchSize) || batchSize < 1 || batchSize > 4) {
    throw new Error('invalid_batch_size');
  }
  return batchSize;
}

/**
 * Formats generation settings for display
 * @param ctx The Telegraf context
 * @param state The wizard state
 * @returns Formatted message string
 */
export function formatGenerationSettings(ctx: MyContext, state: GenerateWizardState): string {
  return ctx.i18n.t('bot:generate.processing', {
    prompt: state.generationData.prompt,
  });
}

/**
 * Creates and ensures upload directory exists
 * @param telegramId The user's Telegram ID
 * @returns Path to the upload directory
 */
export function ensureUploadDirectory(telegramId: string): string {
  const uploadDir = process.env.UPLOAD_DIR || 'uploads';
  const userDir = path.join(uploadDir, telegramId || 'anonymous');
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  return userDir;
}

/**
 * Interface for generation record parameters
 */
interface GenerationRecordParams {
  userId: string;
  prompt: string;
  negativePrompt: string;
  seed: number;
  width: number;
  height: number;
  batchSize: number;
  model: string;
  chatId: string;
  messageId: number;
  translatedPrompt?: string;
  status?: GenerationStatus;
  imageUrls?: string[];
  error?: string;
}

/**
 * Creates generation record in database
 */
export async function createGenerationRecord(params: GenerationRecordParams): Promise<any> {
  const { 
    userId, 
    prompt, 
    negativePrompt, 
    seed, 
    width, 
    height, 
    batchSize, 
    model, 
    chatId, 
    messageId,
    status = GenerationStatus.PENDING,
    imageUrls = [],
    error = null
  } = params;
  
  const finalSeed = seed === -1 ? Math.floor(Math.random() * 2147483647) : seed;
  
  return prisma.generation.create({
    data: {
      userId,
      prompt,
      negativePrompt: negativePrompt || '',
      seed: finalSeed,
      width,
      height,
      batchSize,
      model,
      status,
      chatId,
      messageId,
      imageUrls,
      error
    }
  });
}

/**
 * Updates generation status in database
 */
export async function updateGenerationStatus(
  generationId: string, 
  status: GenerationStatus, 
  imageUrls: string[] = [],
  error: string = null
): Promise<any> {
  const updateData: any = {
    status,
    imageUrls,
    error
  };
  

  
  return prisma.generation.update({
    where: { id: generationId },
    data: updateData
  });
}

/**
 * Decrements user's generation count if not subscribed
 * Returns the updated user record
 */
export async function decrementGenerationCount(userId: string): Promise<any> {
  return prisma.user.update({
    where: { id: userId },
    data: { remainingGenerations: { decrement: 1 } }
  });
}

/**
 * Sends remaining generations info
 * @param ctx The Telegraf context
 * @param remainingGenerations The number of remaining generations
 */
export async function sendRemainingGenerationsInfo(
  ctx: MyContext, 
  remainingGenerations: number
): Promise<void> {
  await ctx.reply(
    ctx.i18n.t('bot:generate.remainingGenerations', {
      count: remainingGenerations,
    }),
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: ctx.i18n.t('bot:buttons.generate_more'), callback_data: 'generate_more' }
          ],
          [
            { text: ctx.i18n.t('bot:buttons.invite_friend'), callback_data: 'invite_friend' }
          ]
        ]
      }
    }
  );
}

/**
 * Main function to process photo restoration request
 * @param ctx The Telegraf context
 */
export async function processGeneration(ctx: MyContext): Promise<void> {
  try {
    // Get restoration parameters from state
    const state = ctx.wizard.state as GenerateWizardState;
    const {
      telegramId,
      userId,
      language,
      fileId,
      hasPhoto,
      hasCreases
    } = state.generationData;

    // Send analyzing message
    const statusMessage = await ctx.reply(ctx.i18n.t('bot:generate.analyzingPrompt'), { 
      parse_mode: 'HTML' 
    });

    // Ensure upload directory exists
    ensureUploadDirectory(telegramId);

    try {
      // Generate a unique restoration ID
      
      // Verify we have a photo to restore
      if (!hasPhoto || !fileId) {
        await ctx.reply(ctx.i18n.t('bot:generate.no_photo'));
        return;
      }
      let generationId;
      // Create a restoration record in the database
      if (userId) {
        const generation = await createGenerationRecord({
          userId,
          prompt: 'Photo Restoration',
          negativePrompt: '',
          seed: -1,
          width: 1024,
          height: 1024,
          batchSize: 1,
          model: 'restoration',
          chatId: ctx.chat?.id?.toString() || '',
          messageId: statusMessage.message_id,
          status: GenerationStatus.PENDING
        });
        generationId = generation.id;
      }
      const  {addRestorationJob}=await import('../queues/generationQueue')
      // Add job to restoration queue
      await addRestorationJob({
        userId,
        fileId: fileId,
        hasCreases: Boolean(hasCreases),
        chatId: ctx.chat?.id?.toString() || '',
        messageId: statusMessage.message_id,
        language,
        generationId
      });
      
      // Return from function without waiting for completion
      return;
    } catch (error) {
      // Handle queue error
      Logger.error(error, { 
        context: 'restoration-service', 
        method: 'processGeneration',
        telegramId 
      });
      
      await ctx.reply(ctx.i18n.t('bot:generate.error', {
        lng: language,
        supportUsername: process.env.TELEGRAM_SUPPORT_USERNAME || 'avato_memory_help_bot'
      }), { 
        parse_mode: 'HTML' 
      });
    }
  } catch (error) {
    // Handle overall error
    Logger.error(error, { 
      context: 'restoration-service', 
      method: 'processGeneration' 
    });
    
    await ctx.reply(ctx.i18n.t('bot:generate.error', {
      supportUsername: process.env.TELEGRAM_SUPPORT_USERNAME || 'avato_memory_help_bot'
    }), { 
      parse_mode: 'HTML' 
    });
  }
}

/**
 * Checks if user has enough restorations
 * @param ctx The Telegraf context
 * @param user The user object
 * @returns Boolean indicating if the user can restore
 */
export async function canUserGenerate(ctx: MyContext, user: any): Promise<boolean> {
  if (user.remainingGenerations <= 0 && !user.subscriptionActive) {
    await ctx.reply(
      ctx.i18n.t('bot:generate.no_generations_left', {
        link: `https://t.me/reve_art_bot?start=${user.referralCode}`,
      }),
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: ctx.i18n.t('bot:buttons.invite_friend'), callback_data: 'invite_friend' },
              { text: ctx.i18n.t('bot:buttons.buy_generations'), callback_data: 'buy_generations' }
            ]
          ]
        }
      }
    );
    return false;
  }
  return true;
}




