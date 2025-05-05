import { EffectType } from '../types';
import { Logger } from '../utils/rollbar.logger';
import fs, { readFile } from 'fs/promises';
import path from 'path';
import { fal } from "@fal-ai/client";
import { getMimeType } from './replicate';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { Resolution } from '../types/bot';

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
  'early_ghibli': 'fal-ai/ghiblify-v2',
  '3d_cartoon': 'fal-ai/3d-cartoonify'
};

// Define resolution dimensions
const resolutionDimensions = {
  'SQUARE': { width: 1024, height: 1024 },
  'VERTICAL': { width: 768, height: 1024 },
  'HORIZONTAL': { width: 1024, height: 768 }
};

export async function applyImageEffect(imagePath: string, effect: EffectType, resolution: Resolution = 'SQUARE'): Promise<string> {
  try {
    // Determine the model to use
    const modelId = effectModelMap[effect];
    if (!modelId) {
      throw new Error(`Unsupported effect type: ${effect}`);
    }
    
    // Read the image file and convert to base64
    const imageBuffer = (await readFile(imagePath));
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
    let resultBuffer = Buffer.from(buffer);
    
    // Resize the image according to user's resolution setting
    if (resolution) {
      const dimensions = resolutionDimensions[resolution];
      if (dimensions) {
        resultBuffer = await sharp(resultBuffer)
          .resize(dimensions.width, dimensions.height, {
            fit: 'contain',
            background: { r: 255, g: 255, b: 255, alpha: 1 }
          })
          .toBuffer();
        
      }
    }
    
    const outputDir = path.dirname(imagePath);
    const outputPath = path.join(outputDir, `effect_image.jpg`);
    
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    
    // Save the result
    await fs.writeFile(outputPath, resultBuffer);
    
    return outputPath;
  } catch (error) {
    Logger.error(`Error applying image effect: ${error.message}`, { effect, imagePath });
    throw error;
  }
} 