import { EffectType } from '../types';
import { Logger } from '../utils/rollbar.logger';
import fs from 'fs/promises';
import path from 'path';
import { fal } from "@fal-ai/client";
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

// Define FAL model mappings for different effects
const effectModelMap: Record<string, string> = {
  'plushify': 'fal-ai/plushify',
  'ghiblify': 'fal-ai/ghiblify',
  'cartoonify': 'fal-ai/cartoonify'
};


export async function applyImageEffect(imagePath: string, effect: EffectType, resolution: Resolution = 'SQUARE'): Promise<string> {
  try {
    // Determine the model to use
    const modelId = effectModelMap[effect];
    if (!modelId) {
      throw new Error(`Unsupported effect type: ${effect}`);
    }
    
    // Read the image file and convert to base64
    const imageBuffer = (await fs.readFile(imagePath));
    const file = new File([imageBuffer], path.basename(imagePath), { type: getMimeType(imagePath) });
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