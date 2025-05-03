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
/**
 * Remove creases and repair damaged parts of a photo
 * @param imagePath Path to the local image file
 * @returns Path to the repaired image
 */
export async function removeCreases(imagePath: string): Promise<string> {
  try {
    let imageUrl = imagePath;
    
    // If the image is a local file (not a URL), upload it to S3
    if (!imagePath.startsWith('http')) {
      imageUrl = await s3Storage.uploadFile(imagePath);
      console.log(`Uploaded image to S3: ${imageUrl}`);
    }

    console.log(imageUrl)

    const response = await fetch('https://api.nero.com/biz/api/task', {
      method: 'POST',
      headers: {
        'x-neroai-api-key': process.env.NERO_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'ScratchFix',
        body: {
          image: imageUrl
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Nero API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`Task created with ID: ${data.data.task_id}`);
    console.log("Data: ", data)
    const taskId = data.data.task_id;
    let result;

    while (true) {
      const statusResponse = await fetch(`https://api.nero.com/biz/api/task?task_id=${taskId}`, {
        headers: {
          'x-neroai-api-key': process.env.NERO_API_KEY
        }
      });

      const statusData = await statusResponse.json();

      if (statusData.code !== 0) {
        throw new Error(`Nero API returned error code: ${statusData.code}`);
      }

      console.log("statusData ", statusData)

      if (statusData.data.status === 'done') {
        result = statusData.data.result;
        console.log(`Task completed with result: ${result.output}`);
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 15000));
    }

    await s3Storage.deleteFile(imageUrl);
    
    return result.output;
  } catch (error) {
    console.log(error.data);
    Logger.error(error, {
      context: 'replicate',
      method: 'removeCreases',
      imagePath,
    });
    
    // Rethrow as a structured error that can be handled by the worker
    throw {
      type: 'CREASE_REMOVAL_ERROR',
      originalPath: imagePath,
      message: error.message || 'Error in crease removal step'
    };
  }
}

// !! DEPRECATED !!
// Logic with gemini flash edit is deprecated
// export async function removeCreases(imagePath: string): Promise<string> {
//   try {
//     const imageBase64 = (await readFile(imagePath));
//     const file = new File([imageBase64], path.basename(imagePath), { type: getMimeType(imagePath) });

//     const url = await fal.storage.upload(file);


//     const input = {
//       prompt: REMOVE_CREASERS_PROMPT,
//       image_url: url
//     }


//     const result = await fal.subscribe("fal-ai/gemini-flash-edit", {
//       input,
//       logs: true,
//       onQueueUpdate: (update) => {
//         if (update.status === "IN_PROGRESS") {
//           update.logs.map((log) => log.message).forEach(console.log);
//         }
//       },
//     });

    

//     // Return the processed image URL
//     return result.data.image.url;
//   } catch (error) {
//     console.log(error.data);
//     Logger.error(error, {
//       context: 'replicate',
//       method: 'removeCreases',
//       imagePath,
//     });
//     throw error;
//     // Fallback: If crease removal fails, just return the original image
//   }
// }

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
/**
 * Restore an old photo using Microsoft's bringing-old-photos-back-to-life model
 * @param imagePath Path to the local image file
 * @returns Path to the restored image
 */
export async function restoreOldPhoto(imagePath: string): Promise<string> {
  try {

    let imageData;
    if (imagePath.startsWith('https://')) {
      imageData = imagePath
    }else{ 


    const imageBase64 = (await readFile(imagePath)).toString('base64');
    imageData = `data:application/octet-stream;base64,${imageBase64}`
  }

    const input = {
      img: imageData,
      version: 'v1.4',
      scale: 2,
    }

  const prediction = await replicate.predictions.create({
    version: "0fbacf7afc6c144e5be9767cff80f25aff23e52b0708f17e20f9879b2f21516c",
    input
  });
  // { "id": "xyz...", "status": "starting", ... }
  
  let completed = await checkPrediction(prediction.id, 30000, 10);
  
  
  //=> output written to disk
    
    // Save the output image to a file
    
    
    return completed.output;
  } catch (error) {
    Logger.error(error, {
      context: 'replicate',
      method: 'restoreOldPhoto',
      imagePath,
    });
    
    throw error;
  }
}

/**
 * Colorize a black and white photo
 * @param imagePath Path to the local image file
 * @returns Path to the colorized image
 */
export async function colorizePhoto(imagePath: string): Promise<string> {
  try {

    const prediction = await replicate.predictions.create({
      version: "ca494ba129e44e45f661d6ece83c4c98a9a7c774309beca01429b58fce8aa695",
      input: {
        image: imagePath,
        model_size: "large"
      }
    });

    const completed = await checkPrediction(prediction.id, 20000, 10);
    
    // Save the output image to a file
    
    return completed.output;
  } catch (error) {
    Logger.error(error, {
      context: 'replicate',
      method: 'colorizePhoto',
      imagePath,
    });
    
    // Fallback: If colorization fails, just return the original image
    throw error;
  }
}

