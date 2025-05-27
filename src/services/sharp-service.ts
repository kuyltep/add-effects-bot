import sharp from 'sharp';
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs/promises';
import path from 'path';
import { Resolution } from '@prisma/client';
import { Logger } from '../utils/rollbar.logger';

// Configuration for image effects
const config = {
  sharpen: {
    sigma: 0.8, // Radius of sharpness
    m1: 0.55, // Smart Sharpen Ratio
    m2: 0.5, // CAS Amount
  },
  grain: {
    intensity: 0.35, // Grain intensity
    scale: 8, // Grain size
  },
  vignette: {
    intensity: 0.25, // Vignette intensity (reduced for more transparent effect)
    power: 1.3, // Degree of darkening towards edges (reduced for softer effect)
  },
  finalSharpen: {
    sigma: 0.8, // Final sharpness
    amount: 0.5, // Final sharpness level
  },
};

// Resolution dimensions mapping
export const getResolutionDimensions = (resolution: Resolution) => {
  const dimensionsMap = {
    SQUARE: { width: 1024, height: 1024 },
    VERTICAL: { width: 768, height: 1024 },
    HORIZONTAL: { width: 1024, height: 768 },
  };

  return dimensionsMap[resolution] || dimensionsMap.SQUARE;
};

/**
 * Convert any image to PNG format with specific dimensions
 * @param imagePath Path to source image
 * @param outputPath Path for the output PNG (if null, will be derived from source)
 * @param width Target width
 * @param height Target height
 * @returns Path to converted PNG
 */
export async function convertToPng(
  imagePath: string,
  outputPath: string = null,
  width: number = 1024,
  height: number = 1024
): Promise<string> {
  try {
    // Derive output path if not provided
    if (!outputPath) {
      const dir = path.dirname(imagePath);
      const basename = path.basename(imagePath, path.extname(imagePath));
      outputPath = path.join(dir, `${basename}.png`);
    }

    // Convert image to PNG with specified dimensions
    await sharp(imagePath)
      .resize(width, height, {
        fit: 'cover',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .toFormat('png')
      .toFile(outputPath);

    return outputPath;
  } catch (error) {
    Logger.error(`Error converting image to PNG: ${error.message}`, { imagePath });
    throw error;
  }
}

/**
 * Resize an image according to specified resolution
 * @param imagePath Path to source image
 * @param resolution Resolution enum value
 * @param outputPath Path for output image (if null, overwrites source)
 * @returns Path to resized image
 */
export async function resizeImage(
  imagePath: string,
  resolution: Resolution,
  outputPath: string = null
): Promise<string> {
  try {
    // Get dimensions for the specified resolution
    const dimensions = getResolutionDimensions(resolution);

    // If no output path specified, overwrite the original
    const targetPath = outputPath || imagePath;

    // Resize image using sharp
    await sharp(imagePath)
      .resize(dimensions.width, dimensions.height, {
        fit: 'cover',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .toFormat((path.extname(targetPath).replace('.', '') as any) || 'jpeg')
      .toFile(targetPath);

    return targetPath;
  } catch (error) {
    Logger.error(`Error resizing image: ${error.message}`, { imagePath, resolution });
    throw error;
  }
}

/**
 * Apply grain effect to an image
 * @param imageBuffer Image buffer to process
 * @param intensity Grain intensity (0-1)
 * @param scale Grain scale/size
 * @returns Processed image buffer
 */
export const applyGrain = async (
  imageBuffer: Buffer,
  intensity = config.grain.intensity,
  scale = config.grain.scale
): Promise<Buffer> => {
  const image = await loadImage(imageBuffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');

  // Draw the image on canvas
  ctx.drawImage(image, 0, 0);

  // Get image data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  // Apply grain effect
  for (let i = 0; i < pixels.length; i += 4) {
    const grain = (Math.random() * 2 - 1) * intensity * scale;
    pixels[i] = Math.max(0, Math.min(255, pixels[i] + grain));
    pixels[i + 1] = Math.max(0, Math.min(255, pixels[i + 1] + grain));
    pixels[i + 2] = Math.max(0, Math.min(255, pixels[i + 2] + grain));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer();
};

/**
 * Apply vignette effect to an image
 * @param imageBuffer Image buffer to process
 * @param intensity Vignette intensity (0-1)
 * @param power Degree of darkening towards edges
 * @returns Processed image buffer
 */
export const applyVignette = async (
  imageBuffer: Buffer,
  intensity = config.vignette.intensity,
  power = config.vignette.power
): Promise<Buffer> => {
  const image = await loadImage(imageBuffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');

  // Draw the image on canvas
  ctx.drawImage(image, 0, 0);

  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);

  // Get image data
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  // Pre-calculate distances for performance
  const distances = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy) / maxRadius;
      distances[y * width + x] = Math.pow(dist, power) * intensity;
    }
  }

  // Apply vignette (single-pass processing)
  for (let i = 0; i < pixels.length; i += 4) {
    const idx = i / 4;
    const vignetteAmount = distances[idx];

    pixels[i] = Math.max(0, pixels[i] * (1 - vignetteAmount));
    pixels[i + 1] = Math.max(0, pixels[i + 1] * (1 - vignetteAmount));
    pixels[i + 2] = Math.max(0, pixels[i + 2] * (1 - vignetteAmount));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer();
};

/**
 * Apply CAS (Contrast Adaptive Sharpening) to an image
 * @param imageBuffer Image buffer to process
 * @param amount Sharpening amount (0-1)
 * @returns Processed image buffer
 */
export const applyCAS = async (
  imageBuffer: Buffer,
  amount = config.finalSharpen.amount
): Promise<Buffer> => {
  // Use sharp's built-in sharpening algorithm
  return sharp(imageBuffer)
    .sharpen({
      sigma: config.finalSharpen.sigma,
      m1: amount,
      m2: amount * 0.8,
    })
    .toBuffer();
};

/**
 * Save a buffer as an image file
 * @param buffer Image buffer to save
 * @param outputPath Path to save the image
 * @param format Image format (jpg, png, etc)
 * @param quality Image quality (0-100)
 */
export async function saveImageBuffer(
  buffer: Buffer,
  outputPath: string,
  format: 'jpeg' | 'png' | 'webp' = 'jpeg',
  quality: number = 90
): Promise<string> {
  try {
    // Ensure directory exists
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    // Save image with specified format and quality
    await sharp(buffer)[format]({ quality }).toFile(outputPath);

    return outputPath;
  } catch (error) {
    Logger.error(`Error saving image buffer: ${error.message}`, { outputPath });
    throw error;
  }
}

/**
 * Apply full post-processing pipeline to an image
 * @param inputPath Path to source image
 * @param outputPath Path for output image
 * @returns Path to processed image
 */
export const postProcessImage = async (inputPath: string, outputPath: string): Promise<string> => {
  try {
    // 1. Load the image
    const image = sharp(inputPath);

    // 2. Apply basic sharpening with Sharp
    let processedImage = await image
      .sharpen({
        sigma: config.sharpen.sigma,
        m1: config.sharpen.m1,
        m2: config.sharpen.m2,
      })
      .toBuffer();

    // 3. Add grain
    processedImage = await applyGrain(processedImage);

    // 4. Add vignette
    processedImage = await applyVignette(processedImage);

    // 5. Apply final sharpening
    processedImage = await applyCAS(processedImage);

    // 6. Save result as jpg
    await saveImageBuffer(processedImage, outputPath, 'jpeg', 100);

    return outputPath;
  } catch (error) {
    Logger.error('Error processing image:', error);
    throw error;
  }
};
