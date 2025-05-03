import Replicate from "replicate";
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { publishMessage, publishBatch } from '../utils/redis';
import { prisma } from '../utils/prisma';
import { GenerationStatus } from '@prisma/client';
import { Logger } from '../utils/rollbar.logger';
import { readFile} from "fs/promises";
import { fal } from "@fal-ai/client";
import path from "path";
import { s3Storage } from '../utils/s3Storage';

// Log token first few chars for debugging

export const replicate = new Replicate({auth: process.env.REPLICATE_API_TOKEN});
fal.config({
  credentials: process.env.FAL_API_KEY
});
// Base API URL for webhook callbacks
const API_BASE_URL = process.env.API_BASE_URL;

const REMOVE_CREASERS_PROMPT="Please remove white scratches and cracks in the photo. People's faces should remain as similar and untouched as possible."
/**
 * Enhance image quality using Aura SR model
 * @param imagePath Path to the source image
 * @returns URL of the enhanced image
 */
export async function enhanceImage(imagePath: string): Promise<string> {
  try {
    // Read image as base64
    let imageData;
    if (imagePath.startsWith('https://')) {
      imageData = imagePath
    }else{
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    imageData = `data:application/octet-stream;base64,${base64Image}`
    }

    // Call Replicate API to enhance image
    const output = await replicate.run(
      "zsxkib/aura-sr-v2:5c137257cce8d5ce16e8a334b70e9e025106b5580affed0bc7d48940b594e74c",
      {
        input: {
          image: imageData,
          output_format: 'png',
          max_batch_size: 32,
          output_quality: 100,
        }
      }
    );
    // Return the enhanced image URL directly
    return String(output);
  } catch (error) {
    console.error('Error enhancing image:', error);
    throw new Error(`Image enhancement failed: ${error.message}`);
  }
}

/**
 * Generate a video from an image using Replicate API with webhook
 * @param imagePath Path to the source image or URL to an enhanced image
 * @param prompt Text prompt for video generation
 * @param generationId ID of the generation record in database
 * @param chatId Telegram chat ID to send the video to
 * @param userId User ID who requested the video
 * @param messageId Message ID of the processing message
 * @param language User's preferred language
 * @returns Prediction ID from Replicate
 */

async function generateVideoWithMoveEffect(imagePathOrUrl: string, prompt: string, generationId: string, chatId: number, userId: string, messageId: number, language: string = 'en', effect: string = 'animation'): Promise<string> {
  let imageBase64;
  
  
  if (imagePathOrUrl.startsWith('http')) {
    // It's a URL, we'll pass it directly to the model
    // First download the image to convert to base64
    const response = await fetch(imagePathOrUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    const imageBuffer = await response.arrayBuffer();
    imageBase64 = Buffer.from(imageBuffer).toString('base64');
  } else {
    // It's a local file path, read it
    const imageBuffer = fs.readFileSync(imagePathOrUrl);
    imageBase64 = imageBuffer.toString('base64');
  }
  
  // Create unique webhook ID
  const webhookId = uuidv4();
  
  const webhookUrl = `${API_BASE_URL}/api/generation/video-webhook/${webhookId}?generationId=${generationId}&chatId=${chatId}&userId=${userId}&messageId=${messageId}&language=${language}&effect=${effect}`;
  
  const prediction = await replicate.predictions.create({
    version: "minimax/video-01-live",
    input: {
      first_frame_image: `data:application/octet-stream;base64,${imageBase64}`,
      prompt: prompt,
      prompt_optimizer: false,
    },
    webhook: webhookUrl,
    webhook_events_filter: ["completed"]
  });

  setTimeout(async () => {console.log(JSON.stringify(await getPredictionStatus(prediction.id)))
  }, 60000);
  // Return the prediction ID
  return prediction.id;
}

async function generateVideoWithHugEffect(imagePathOrUrl: string, prompt: string, generationId: string, chatId: number, userId: string, messageId: number, language: string = 'en', effect: string = 'hug'): Promise<string> {
  console.log(imagePathOrUrl)
  const imageBase64 = (await readFile(imagePathOrUrl));
  const file = new File([imageBase64], path.basename(imagePathOrUrl), { type: getMimeType(imagePathOrUrl) });
  const webhookId = uuidv4();
  const webhookUrl = `${API_BASE_URL}/api/generation/video-webhook/${webhookId}?generationId=${generationId}&chatId=${chatId}&userId=${userId}&messageId=${messageId}&language=${language}&effect=${effect}`;
  const url = await fal.storage.upload(file);
  console.log(url)
  const { request_id } = await fal.queue.submit("fal-ai/pixverse/v4/effects", {
    input: {
      effect: "Hug",
      image_url: url,
      resolution: "720p",
      duration: "5"
    },
    webhookUrl: webhookUrl,
  });


  return request_id;
}

export async function generateVideoFromImage(
  imagePathOrUrl: string, 
  prompt: string,
  generationId: string,
  chatId: number,
  userId: string,
  messageId: number,
  language: string = 'en',
  effect: string = 'animation'
): Promise<string> {
  try {
    if (effect === 'animation') {
      return await generateVideoWithMoveEffect(imagePathOrUrl, prompt, generationId, chatId, userId, messageId, language, effect);
    } else if (effect === 'hug') {
      return await generateVideoWithHugEffect(imagePathOrUrl, prompt, generationId, chatId, userId, messageId, language, effect);
    } else {
      throw new Error(`Invalid effect: ${effect}`);
    }
    // Check if the path is a URL or a local file

  } catch (error) {
    console.error('Error generating video:', error);
    throw new Error(`Video generation failed: ${error.message}`);
  }
}

/**
 * Get prediction status
 * @param predictionId Prediction ID from Replicate
 * @returns Prediction status and output if available
 */
export async function getPredictionStatus(predictionId: string): Promise<{ status: string, output?: string }> {
  try {
    const prediction = await replicate.predictions.get(predictionId);
    
    return {
      status: prediction.status,
      output: prediction.output ? prediction.output[0] : undefined
    };
  } catch (error) {
    console.error('Error getting prediction status:', error);
    throw new Error(`Failed to get prediction status: ${error.message}`);
  }
}

/**
 * Process completed video generation and notify user
 * @param generationId Generation ID in database
 * @param videoUrl URL of the generated video
 * @param chatId Telegram chat ID to send video to
 * @param messageId Message ID of processing message
 * @param language User's preferred language
 */
export async function processCompletedVideo(
  generationId: string,
  videoUrl: string,
  chatId: number,
  messageId: number,
  language: string
): Promise<void> {
  try {
    // Update generation record
    await prisma.generation.update({
      where: { id: generationId },
      data: {
        status: GenerationStatus.COMPLETED,
        imageUrls: [videoUrl]
      }
    });
    
    // Send all messages in a batch to ensure efficient connection usage
    await publishBatch([
      {
        channel: 'bot:status_update',
        message: JSON.stringify({
          chatId,
          messageId,
          text: language === 'ru' ? '🎬 Ваше видео готово!' : '🎬 Your video is ready!',
          parseMode: 'HTML'
        })
      },
      {
        channel: 'bot:send_video',
        message: JSON.stringify({
          chatId,
          videoUrl,
          caption: language === 'ru' 
            ? `Видео, созданное из вашего изображения.`
            : `Video generated from your image.`
        })
      }
    ]);
    
    console.log(`Video sent to chat ${chatId}`);
  } catch (error) {
    console.error('Error processing completed video:', error);
    
    // Try to notify user of error
    await publishMessage('bot:send_message', JSON.stringify({
      chatId,
      text: language === 'ru' 
        ? '❌ Ошибка при обработке видео. Пожалуйста, попробуйте позже.'
        : '❌ Error processing video. Please try again later.',
      parseMode: 'HTML'
    }));
  }
}

function getMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream"; // По умолчанию
  }
}

async function checkPrediction(predictionId: string, interval: number = 30000, maxAttempts: number = 5) {
  for (let i = 0; i < maxAttempts; i++) {
  const latest = await replicate.predictions.get(predictionId);
  console.log(latest);
    if (latest.status !== "starting" && latest.status !== "processing") {
      return latest;
    }
    // Wait for 2 seconds and then try again.
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}


