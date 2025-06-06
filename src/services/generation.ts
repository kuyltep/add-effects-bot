import { GenerationStatus, User } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { prisma } from '../utils/prisma';
import config from '../config';
import { v4 as uuidv4 } from 'uuid';
import { MyContext, EffectType } from '../types';
import { Logger } from '../utils/rollbar.logger';
import { addImageEffectJob, ImageEffectJobData } from '../queues/imageEffectQueue';
import { Markup } from 'telegraf';

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

// Initialize directories
initializeDirectories();

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
 * Validates if the prompt meets minimum requirements
 * @param prompt The user's prompt text
 * @returns Boolean indicating if prompt is valid
 */
export function isValidPrompt(prompt: string): boolean {
  return prompt.length >= 3;
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
 * Interface for generation record parameters (simplified for queueing)
 */
interface GenerationRecordParams {
  generationId: string;
  userId: string;
  prompt: string; // Prompt might be added later or be effect name
  effect: EffectType; // Store the selected effect
  chatId: string;
  messageId: number;
  status?: GenerationStatus;
}

/**
 * Queues a new image effect generation job.
 *
 * @param data - Data required for the image effect generation
 * @returns The job instance
 */
export async function queueImageGenerationJob(
  data: Omit<ImageEffectJobData, 'generationId'> & { generationId?: string }
) {
  try {
    // Generate a new ID if not provided
    const generationId = data.generationId || uuidv4();

    // For appearance effects, use the appearance prompt in the record
    const promptText = data.appearancePrompt 
      ? `Effect: ${data.effect} - ${data.appearancePrompt}` 
      : `Effect: ${data.effect}`;

    // Create a generation record
    await prisma.generation.create({
      data: {
        id: generationId,
        userId: data.userId,
        prompt: promptText, // Use effect name and appearance prompt
        seed: Math.floor(Math.random() * 2147483647), // Random seed
        status: GenerationStatus.PENDING,
        chatId: data.chatId,
        messageId: data.messageId,
      },
    });

    // Queue the job
    const jobData: ImageEffectJobData = {
      ...data,
      generationId,
    };

    const job = await addImageEffectJob(jobData);
    return job;
  } catch (error) {
    Logger.error(`Error queueing image effect job: ${error.message}`, {
      userId: data.userId,
      fileIds: data.fileIds,
      effect: data.effect,
      appearancePrompt: data.appearancePrompt,
    });
    throw error;
  }
}

/**
 * Queues a new image from text generation job.
 *
 * @param data - Data required for the text based image generation
 * @returns The job instance
 */
export async function queueImageFromTextGenerationJob(
  data: Omit<ImageEffectJobData, 'generationId'> & { generationId?: string }
) {
  try {
    // Generate a new ID if not provided
    const generationId = data.generationId || uuidv4();

    // Create a generation record
    await prisma.generation.create({
      data: {
        id: generationId,
        userId: data.userId,
        prompt: `Effect: ${data.effect}`, // Use effect name as prompt
        seed: Math.floor(Math.random() * 2147483647), // Random seed
        status: GenerationStatus.PENDING,
        chatId: data.chatId,
        messageId: data.messageId,
      },
    });

    // Queue the job
    const jobData: ImageEffectJobData = {
      ...data,
      generationId,
    };

    const job = await addImageEffectJob(jobData);
    return job;
  } catch (error) {
    Logger.error(`Error queueing image effect job: ${error.message}`, {
      userId: data.userId,
      fileIds: data.fileIds,
      effect: data.effect,
    });
    throw error;
  }
}

/**
 * Checks if a user can generate images.
 * Returns false if not enough generations, not enough time passed, etc.
 *
 * @param ctx - Telegram context
 * @param userData - User data
 * @returns boolean indicating if the user can generate
 */
export async function canUserGenerate(
  ctx: MyContext,
  userData: Pick<User, 'id' | 'remainingGenerations' | 'subscriptionActive' | 'referralCode'>
): Promise<boolean> {
  // Check if the user has remaining generations
  if (userData.remainingGenerations <= 0 && !userData.subscriptionActive) {
    await ctx.reply(
      ctx.i18n.t('bot:generate.no_generations_left', {
        link: `https://t.me/${process.env.BOT_USERNAME}?start=${userData.referralCode}`,
      }),
      Markup.inlineKeyboard([
        Markup.button.callback(ctx.i18n.t('bot:buttons.buy_generations'), 'buy_generations'),
      ])
    );
    return false;
  }

  const currentDate = new Date()
  const oneHourAgo = new Date(new Date().setHours(currentDate.getHours() - 1))

  // Check for ongoing generations
  const ongoingGenerations = await prisma.generation.count({
    where: {
      userId: userData.id,
      status: {
        in: [GenerationStatus.PENDING, GenerationStatus.PROCESSING],
      },
      createdAt: {
        gte: oneHourAgo
      }
    },
  });

  if (ongoingGenerations >= 3) {
    await ctx.reply(ctx.i18n.t('bot:generate.too_many_ongoing'));
    return false;
  }

  return true;
}
