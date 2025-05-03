import { GenerationStatus } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { ReveAI } from 'reve-sdk';
import { prisma } from '../utils/prisma';
import config from '../config';
import { v4 as uuidv4 } from 'uuid';
import { MyContext, GenerateWizardState, GenerationResponse } from '../types';
import  {  addRestorationJob } from '../queues/generationQueue';
import { 
  getNextReveAccount, 
  initializeReveSDK as createReveSDK, 
  markAccountAsUsed, 
  markAccountWithError 
} from './reve-account';
import { Logger } from '../utils/rollbar.logger';
import { reduceRemainingGenerations } from './user';

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

// Create a map to store SDK instances by account ID
const reveSDKInstances = new Map<string, ReveAI>();

// Initialize cache
const generationCache = new Map<string, GeneratedImage[]>();

// Initialize directories
initializeDirectories();

/**
 * Initialize the Reve SDK client
 */

/**
 * Ensure necessary directories exist
 */
function initializeDirectories() {
  const uploadsDir = config.server.uploadDir;
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

/**
 * Get or create a Reve SDK instance for the given account
 */
async function getReveSDKInstance(forceNewAccount = false): Promise<{ sdk: ReveAI; accountId: string }> {
  try {
    // Get the next account to use
    const account = await getNextReveAccount(!forceNewAccount);
    
    // Get existing SDK instance or create a new one
    let sdk = reveSDKInstances.get(account.id);
    if (!sdk) {
      sdk = createReveSDK(account);
      reveSDKInstances.set(account.id, sdk);
    }
    
    // Mark account as used (increment counter & update timestamp)
    await markAccountAsUsed(account.id);
    
    return { sdk, accountId: account.id };
  } catch (error) {
    Logger.error(error, {
      context: 'generation-service',
      method: 'getReveSDKInstance',
      forceNewAccount
    });
    
    // Fallback to config values if all else fails
    const defaultSdk = new ReveAI({
      auth: {
        authorization: config.reve.auth,
        cookie: config.reve.cookie,
      },
      projectId: config.reve.projectId,
      timeout: config.reve.timeout,
      pollingInterval: config.reve.pollingInterval,
      maxPollingAttempts: config.reve.maxPollingAttempts,
    });
    
    return { sdk: defaultSdk, accountId: 'default' };
  }
}

/**
 * Main function to generate images
 */
export async function generateImage(params: GenerationParams): Promise<{
  images: GeneratedImage[];
  generationId: string;
  remainingGenerations?: number;
}> {
  // Use provided generationId or generate a new one
  const generationId = params.generationId || uuidv4();
  
  // Normalize parameters
  const normalizedParams = normalizeGenerationParams(params);
  
  try {
    // Check if user has enough generations if userId provided and not subscribed
    let user = null;
    let remainingGenerations = null;
    
    if (normalizedParams.userId && !normalizedParams.subscriptionActive) {
      user = await prisma.user.findUnique({
        where: { id: normalizedParams.userId }
      });
      
      if (user && user.remainingGenerations <= 0 && !user.subscriptionActive) {
        throw new Error('No remaining generations and no active subscription');
      }
    }
    
    // Check if generation record already exists
    let generation = null;
    if (normalizedParams.userId) {
      if (generationId) {
        // Try to find existing generation
        generation = await prisma.generation.findUnique({
          where: { id: generationId }
        });
      }
      
      // If no existing generation, create a new one
      if (!generation) {
        generation = await createGenerationRecord({
          generationId,
          userId: normalizedParams.userId,
          prompt: normalizedParams.prompt,
          translatedPrompt: normalizedParams.translatedPrompt || '',
          negativePrompt: normalizedParams.negativePrompt || '',
          seed: normalizedParams.seed,
          width: normalizedParams.width,
          height: normalizedParams.height,
          batchSize: normalizedParams.batchSize,
          model: normalizedParams.model,
          chatId: normalizedParams.chatId || '',
          messageId: normalizedParams.messageId || 0,
          status: GenerationStatus.PROCESSING // Set to PROCESSING right away
        });
      } else {
        // Update status to PROCESSING if it exists
        await updateGenerationStatus(generationId, GenerationStatus.PROCESSING);
      }
    }
    
    try {
      // Call the AI service to generate images
      const generatedImages = await generateImagesWithAI(normalizedParams, generation);
      
      // Decrement generation count if needed - still handled here
      if (!normalizedParams.subscriptionActive && normalizedParams.userId) {
        const updatedUser = await decrementGenerationCount(normalizedParams.userId);
        remainingGenerations = updatedUser.remainingGenerations;
      }
      
      // Cache the result
      const cacheKey = buildCacheKey(normalizedParams);
      generationCache.set(cacheKey, generatedImages);
      
      // Return the generated images and generation ID
      return { 
        images: generatedImages,
        generationId,
        remainingGenerations
      };
    } catch (error) {
      Logger.error(error, {
        context: 'generation-service',
        method: 'generateImage',
        generationId,
        userId: normalizedParams.userId
      });
      throw error;
    }
  } catch (error) {
    // Update generation record with error status - now handled by the worker
    if (normalizedParams.userId && generationId) {
      // Only update if we threw an error during image generation itself
      await updateGenerationStatus(
        generationId, 
        GenerationStatus.FAILED, 
        [], 
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
    
    throw error;
  }
}

/**
 * Normalize and set default values for generation parameters
 */
function normalizeGenerationParams(params: GenerationParams) {
  const {
    prompt,
    negativePrompt = '',
    seed = -1,
    width = config.defaultGenerationSettings.width,
    height = config.defaultGenerationSettings.height,
    batchSize = config.defaultGenerationSettings.batchSize,
    model = undefined,
    outputFolder = path.join(config.server.uploadDir, Date.now().toString()),
    userId,
    telegramId,
    chatId,
    messageId,
    language,
    subscriptionActive,
    generationId,
    translatedPrompt,
    
  } = params;

  return {
    prompt,
    negativePrompt,
    seed,
    width,
    height,
    batchSize,
    model,
    outputFolder,
    userId,
    telegramId,
    chatId,
    messageId,
    language,
    subscriptionActive,
    generationId,
    translatedPrompt,
  };
}

/**
 * Build cache key from parameters
 */
function buildCacheKey(params: ReturnType<typeof normalizeGenerationParams>): string {
  const { prompt, negativePrompt, seed, width, height, batchSize, model } = params;
  return `${prompt}-${negativePrompt}-${seed}-${width}-${height}-${batchSize}-${model}`;
}

/**
 * Generate images using the AI service
 */
async function generateImagesWithAI(
  params: ReturnType<typeof normalizeGenerationParams>,
  generation: any
): Promise<GeneratedImage[]> {
  const { 
    prompt,
    negativePrompt,
    seed,
    width,
    height,
    batchSize,
    model,
    outputFolder
  } = params;

  // Ensure batchSize is a valid number between 1 and 4
  const numBatchSize = Number(batchSize);
  const validBatchSize = isNaN(numBatchSize) || numBatchSize < 1 || numBatchSize > 4 
    ? 1 
    : numBatchSize;
    

  
  // Use translated prompt if available, otherwise use original
  const promptToUse = generation?.translatedPrompt || prompt;

  // Initialize variables for account rotation
  let accountId = null;
  let reveInstance = null;
  let retryCount = 0;
  const MAX_RETRIES = 3;
  
  while (retryCount <= MAX_RETRIES) {
    try {
      // Get SDK instance with a new account if retrying
      const { sdk, accountId: newAccountId } = await getReveSDKInstance(retryCount > 0);
      reveInstance = sdk;
      accountId = newAccountId;
      
      // Call Reve AI to generate images
      const reveResponse = await reveInstance.generateImage({
        prompt: promptToUse,
        negativePrompt: negativePrompt || '',
        width,
        height,
        batchSize: validBatchSize, // Use validated batch size
        seed: seed,
        model: model,
        enhancePrompt: true,
      });

      if (!reveResponse || !reveResponse.imageUrls || reveResponse.imageUrls.length === 0) {
        throw new Error('No images were generated by the AI service');
      }


      
      // Ensure output directory exists
      ensureDirectoryExists(outputFolder);
      
      // Process the generated images
      return await processGeneratedImages(reveResponse, outputFolder, generation);
    } catch (error) {
      retryCount++;
      
      // Mark the account as having an error
      if (accountId) {
        await markAccountWithError(accountId);
        Logger.warn(`Reve generation failed, trying with another account`, {
          context: 'generation-service',
          accountId,
          retryCount,
          maxRetries: MAX_RETRIES,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      // Only throw if we've exhausted retries
      if (retryCount > MAX_RETRIES) {
        Logger.error(error, {
          context: 'generation-service',
          method: 'generateImagesWithAI',
          accountId,
          retryCount,
          maxRetries: MAX_RETRIES,
          generationParams: {
            prompt: promptToUse,
            width,
            height,
            seed
          }
        });
        throw new Error(`Failed to generate images after ${MAX_RETRIES} retries: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
  
  // Should never reach here but TypeScript needs this
  throw new Error('Failed to generate images after exhausting retries');
}

/**
 * Ensure a directory exists
 */
function ensureDirectoryExists(directory: string) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

/**
 * Process the images generated by the AI
 */
async function processGeneratedImages(reveResponse: any, outputFolder: string, generation: any) {
  // Process images in parallel
  const imagePromises = reveResponse.imageUrls.map(async (base64Image: string, index: number) => {
    // Extract the base64 data
    const base64Data = extractBase64Data(base64Image);
    
    // Convert to buffer
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Apply watermark
    const watermarkedBuffer = await applyWatermark(buffer);
    
    // Create user-friendly filename
    const filename = `awesome_photo_${index + 1}.png`;
    const filePath = path.join(outputFolder, filename);
    await fs.promises.writeFile(filePath, watermarkedBuffer);
    
    // Get file size
    const stats = await fs.promises.stat(filePath);
    
    return {
      path: filePath,
      size: stats.size,
    };
  });
  
  return await Promise.all(imagePromises);
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
  generationId: string;
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
    generationId, 
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
      id: generationId,
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
 * Updates status message with queue position
 * @param ctx The Telegraf context
 * @param chatId The chat ID
 * @param messageId The message ID to update
 * @param createdAt Creation time of the generation
 */
export async function updateQueueMessage(
  ctx: MyContext,
  chatId: number,
  messageId: number,
  createdAt: Date
): Promise<void> {
  // Count pending jobs ahead of this one
  const pendingCount = await prisma.generation.count({
    where: { 
      status: GenerationStatus.PENDING,
      createdAt: { lt: createdAt }
    }
  });

  // Update message to show queue position
  await ctx.telegram.editMessageText(
    chatId,
    messageId,
    undefined,
    ctx.i18n.t('bot:generate.queued', {
      position: pendingCount + 1
    }),
    { parse_mode: 'HTML' }
  );
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
      const generationId = uuidv4();
      
      // Verify we have a photo to restore
      if (!hasPhoto || !fileId) {
        await ctx.reply(ctx.i18n.t('bot:generate.no_photo'));
        return;
      }
      
      // Create a restoration record in the database
      if (userId) {
        await createGenerationRecord({
          generationId,
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
      }

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




