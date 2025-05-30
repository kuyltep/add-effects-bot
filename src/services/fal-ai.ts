import { EffectType } from '../types';
import { Logger } from '../utils/rollbar.logger';
import fs, { readFile } from 'fs/promises';
import path from 'path';
import { fal } from '@fal-ai/client';
import { getMimeType } from './replicate';
import fetch from 'node-fetch';
import { Resolution } from '../types/bot';
import { resizeImage, saveImageBuffer } from './sharp-service';

// Initialize FAL AI Client
export function initializeFalClient() {
  fal.config({
    credentials: process.env.FAL_API_KEY || '',
  });
}

initializeFalClient();

const API_BASE_URL = process.env.API_BASE_URL;

// Define FAL model mappings for different effects
const effectModelMap: Record<string, string> = {
  plushify: 'fal-ai/plushify',
  ghiblify: 'fal-ai/ghiblify',
  cartoonify: 'fal-ai/cartoonify',
  hunyuan_avatar: 'fal-ai/hunyuan-avatar',
};

export async function applyImageEffect(
  imagePath: string,
  effect: EffectType,
  resolution: Resolution = 'SQUARE'
): Promise<string> {
  try {
    // Determine the model to use
    const modelId = effectModelMap[effect];
    if (!modelId) {
      throw new Error(`Unsupported effect type: ${effect}`);
    }

    // Read the image file and convert to base64
    const imageBuffer = await fs.readFile(imagePath);
    const file = new File([imageBuffer], path.basename(imagePath), {
      type: getMimeType(imagePath),
    });
    const url = await fal.storage.upload(file);

    // Call FAL AI with the image
    const result = await fal.subscribe(modelId, {
      input: {
        image_url: url,
      },
    });

    // Extract the result URL
    const resultUrl = result.data.images ? result.data.images[0].url : result.data.image.url;
    const response = await fetch(resultUrl);
    if (!response.ok) {
      throw new Error(`Failed to download result image: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const resultBuffer = Buffer.from(buffer);

    const outputDir = path.dirname(imagePath);
    const outputPath = path.join(process.cwd(), outputDir, `processed_image.jpg`);

    // Save the result
    await saveImageBuffer(resultBuffer, outputPath, 'jpeg', 100);

    // Resize the image according to user's resolution setting
    if (resolution) {
      const resultPath = path.join(process.cwd(), outputDir, `effect_image.jpg`);
      await resizeImage(outputPath, resolution, resultPath);
      return resultPath;
    }

    return outputPath;
  } catch (error) {
    Logger.error(`Error applying image effect: ${error.message}`, { effect, imagePath });
    throw error;
  }
}

export async function generateVideoWithFalEffect(
  imagePathOrUrl: string,
  prompt: string,
  generationId: string,
  chatId: number,
  userId: string,
  messageId: number,
  language: string = 'en',
  effect: string = 'hug',
  source?: string
): Promise<string> {
  try {
    let imageData;

    if (imagePathOrUrl.startsWith('http')) {
      // If it's a URL, download the image
      const response = await fetch(imagePathOrUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }
      const imageBuffer = await response.arrayBuffer();
      imageData = new File([Buffer.from(imageBuffer)], 'image.jpg', { type: 'image/jpeg' });
    } else {
      // If it's a local file, read it and create a File object
      const imageBuffer = await readFile(imagePathOrUrl);
      imageData = new File([imageBuffer], path.basename(imagePathOrUrl), {
        type: getMimeType(imagePathOrUrl),
      });
    }

    const { v4: uuidv4 } = await import('uuid');
    // Create unique webhook ID for callback
    const webhookId = uuidv4();
    const webhookUrl = `${API_BASE_URL}/api/generation/video-webhook/${webhookId}?generationId=${generationId}&chatId=${chatId}&userId=${userId}&messageId=${messageId}&language=${language}&effect=${effect}&source=${source}`;

    // Upload file to FAL storage
    const url = await fal.storage.upload(imageData);
    console.log(`Image uploaded to FAL storage: ${url}`);

    // Map effect string to FAL API effect name
    const {
      videoConfig: { effectMap },
    } = await import('../config');

    const falEffect = effectMap[effect] || 'Hug';

    // Submit job to FAL AI pixverse model
    const { request_id } = await fal.queue.submit('fal-ai/pixverse/v4/effects', {
      input: {
        effect: falEffect,
        image_url: url,
        resolution: '720p',
        duration: '5',
      },
      webhookUrl: webhookUrl,
    });

    console.log(`FAL AI job submitted with request ID: ${request_id} and effect: ${falEffect}`);

    return request_id;
  } catch (error) {
    console.error(`Error generating video with FAL effect ${effect}:`, error);
    throw error;
  }
}
