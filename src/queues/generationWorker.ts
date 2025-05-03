import { Worker, Job } from 'bullmq';
import path from 'path';
import fs from 'fs';
import { GenerationStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import config from '../config';
import { createRedisConnection, createRedisPublisher } from '../utils/redis';
import i18next from '../i18n';
import { updateRestorationStatus } from '../services/restoration';
import { RestorationJob } from '../types/generation';
import { removeCreases, restoreOldPhoto, colorizePhoto } from '../services/replicate';
import { Logger } from '../utils/rollbar.logger';
import fetch from 'node-fetch';
import { isMainThread, parentPort, workerData } from 'worker_threads';
import { postProcessingImage } from 'src/services/post-processing';

// Initialize resources
const redisConnection = createRedisConnection();
const redisPublisher = createRedisPublisher();

// Ensure uploads directory exists
function initializeDirectories() {
  const uploadsDir = config.server.uploadDir;
  const restorationDir = path.join(uploadsDir, 'restorations');

  if (!fs.existsSync(restorationDir)) {
    fs.mkdirSync(restorationDir, { recursive: true });
  }
}

// Create and configure the worker
function createWorker() {
  return new Worker<RestorationJob>(
    'photo-restoration',
    processRestorationJob,
    { 
      connection: redisConnection,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '3', 10),
      stalledInterval: 10000,
      lockDuration: 300000,
    }
  );
}

// Process a photo restoration job
async function processRestorationJob(job: Job<RestorationJob>): Promise<any> {
  // Get restoration cost from env with default fallback
  const RESTORATION_COST = parseInt(process.env.RESTORATION_COST || '1', 10);
  const RESTORATION_COST_HARD = parseInt(process.env.RESTORATION_COST_HARD || '3', 10);
  // Flag to track if we've successfully decremented generations
  let generationsDecremented = false;
  // Track the job state for potential retry without crease removal
  let currentJobState = {
    isRetryWithoutCreases: false,
    originalPhotoPath: '',
    userResponded: false
  };
  
  try {
    // Extract job data
    const jobData = job.data;
    
    // Log job start
    logJobStart(jobData);
    
    // Skip deduction if this is a retry without creases
      // Deduct generations from user balance
      await prisma.user.update({
        where: { id: jobData.userId },
        data: {
          remainingGenerations: {
            decrement: jobData.hasCreases ? RESTORATION_COST_HARD : RESTORATION_COST
          }
        }
      });
      generationsDecremented = true;
    
    // Notify about processing
    await sendStatusUpdate(jobData, 'processing.analyzing');
    
    // Download photo from Telegram if this is not a retry
    const photoPath = job.data.isRetryWithoutCreases 
      ? job.data.originalPhotoPath 
      : await downloadPhoto(jobData.fileId);

    // Store original path for potential retry
    currentJobState.originalPhotoPath = photoPath;
    
    // Update status to processing
    if (jobData.generationId) {
      await updateRestorationStatus(
        jobData.generationId, 
        GenerationStatus.PROCESSING
      );
    }
    
    // Send status update
    await sendStatusUpdate(jobData, 'processing.restoring');
    
    try {
      // Process the photo through the restoration pipeline
      const restoredPhotoPath = await processPhoto(photoPath, jobData.hasCreases);
      
      // Generate dimensions (for UI consistency)
      const dimensions = await getImageDimensions(restoredPhotoPath);
      
      // Update generation status to completed
      if (jobData.generationId) {
        await updateRestorationStatus(
          jobData.generationId, 
          GenerationStatus.COMPLETED, 
          [restoredPhotoPath]
        );
      }
      
      // Send restored photo to user
      await sendRestorationResults(jobData, {
        path: restoredPhotoPath,
        width: dimensions.width,
        height: dimensions.height
      });
      
      // Return successful result
      return {
        status: 'completed',
        imagePath: restoredPhotoPath
      };
    } catch (processingError) {
      // Special handling for crease removal errors
      if (generationsDecremented) {
        try {
          await prisma.user.update({
            where: { id: job.data.userId },
            data: {
              remainingGenerations: {
                increment: job.data.hasCreases ? RESTORATION_COST_HARD : RESTORATION_COST
              }
            }
          });
    
        } catch (refundError) {
          Logger.error(refundError, {
            context: 'restoration-worker',
            method: 'processRestorationJob.refundGenerations',
            userId: job.data.userId
          });
        }
      }
      if (processingError.type === 'CREASE_REMOVAL_ERROR' && jobData.hasCreases && !job.data.isRetryWithoutCreases) {
        console.log('Crease removal failed, asking user if they want to continue without crease removal');
        
        // Send error to user with retry options
        await handleCreaseRemovalError(jobData, processingError, photoPath);

        // If we decremented user's balance but failed, refund the generation
        
        // Return early - we'll wait for user response
        return {
          status: 'waiting_for_user_input',
          error: 'Crease removal failed, waiting for user decision'
        };
      }
      
      // For other errors, proceed to standard error handling
      throw processingError;
    }
  } catch (error) {
    // Handle errors and notify user
    await handleRestorationError(job, error);

    
    // Return error result
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Log job start
function logJobStart(jobData: RestorationJob) {
  const { userId, generationId, hasCreases } = jobData;

}

// Send status update message via Redis
async function sendStatusUpdate(jobData: RestorationJob, messageKey: string, params: any = {}) {
  const { chatId, messageId } = jobData;
  
  if (!chatId || !messageId) return;
  
  try {
    // Get user's preferred language
    const userLang = jobData.language;
    // Map internal message keys to actual translation keys
    let translationKey;
    let translationParams = params;
    
    switch (messageKey) {
      case 'processing.analyzing':
        translationKey = 'bot:generate.analyzingPhoto';
        break;
      case 'processing.restoring':
        translationKey = 'bot:generate.restoringPhoto';
        break;
      case 'processing.colorizing':
        translationKey = 'bot:generate.colorizingPhoto';
        break;
      default:
        translationKey = 'bot:generate.processing';
    }
    
    // Get localized message
    const text = i18next.t(translationKey, { 
      lng: userLang,
      ...translationParams
    });
    
    await redisPublisher.publish('bot:status_update', JSON.stringify({
      chatId,
      messageId,
      text,
      parseMode: 'HTML'
    }));
  } catch (error) {
    Logger.error(error, { 
      context: 'restoration-worker', 
      method: 'sendStatusUpdate', 
      chatId: jobData.chatId,
      messageId: jobData.messageId
    });
  }
}

// Download photo from Telegram
async function downloadPhoto(fileId: string): Promise<string> {
  try {
    // Create a temporary directory for the download
    const downloadDir = path.join(process.env.UPLOAD_DIR || 'uploads', 'downloads');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }
    
    const downloadPath = path.join(process.cwd(), downloadDir, `original_${Date.now()}.jpg`);
    
    // Request the bot to download the file
    await redisPublisher.publish('bot:download_file', JSON.stringify({
      fileId,
      downloadPath
    }));
    
    const maxWaitTime = 25000; // 15 seconds
    const checkInterval = 5000; // 500ms
    let waitedTime = 0;
    
    while (waitedTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitedTime += checkInterval;
      
      if (fs.existsSync(downloadPath)) {
        // Verify the file is not empty
        const stats = fs.statSync(downloadPath);
        if (stats.size > 0) {
          console.log(`File downloaded successfully to ${downloadPath} (${stats.size} bytes)`);
          return downloadPath;
        }
      }
    }
    
    throw new Error(`Timed out after ${maxWaitTime}ms waiting for file download`);
  } catch (error) {
    Logger.error(error, { 
      context: 'restoration-worker', 
      method: 'downloadPhoto', 
      fileId
    });
    throw error;
  }
}

// Add utility function at the top for reuse
async function saveImageLocally(imageUrl: string, folderName: string, fileName: string): Promise<string> {
  try {
    // Create directory if it doesn't exist
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    const targetDir = path.join(uploadDir, folderName);
    
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const targetPath = path.join(targetDir, fileName);
    
    // Handle both URL and local file
    if (imageUrl.startsWith('http')) {
      // Download from URL
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(targetPath, buffer);
    } else if (fs.existsSync(imageUrl)) {
      // Copy local file
      fs.copyFileSync(imageUrl, targetPath);
    } else {
      throw new Error(`Source image not found: ${imageUrl}`);
    }
    
    return targetPath;
  } catch (error) {
    Logger.error(error, {
      context: 'worker',
      method: 'saveImageLocally',
      imageUrl
    });
    return imageUrl; // Return original on error
  }
}

// Process photo through the restoration pipeline
async function processPhoto(photoPath: string, hasCreases: boolean): Promise<string> {
  try {
    let processedPath = photoPath;
    
    // Step 1: Remove creases if needed
    if (hasCreases) {
      try {
        console.log(`Starting crease removal for ${photoPath}`);
        const creaselessPath = await removeCreases(processedPath);
        processedPath = creaselessPath;
      } catch (creaseError) {
        // Track the crease removal error in a special job property
        throw {
          type: 'CREASE_REMOVAL_ERROR',
          originalPath: photoPath,
          message: creaseError.message || 'Error in crease removal step'
        };
      }
    }
    
    // Step 2: Restore old photo
    console.log(`Starting photo restoration for ${processedPath}`);
    const restoredPath = await restoreOldPhoto(processedPath);
    
    // If photo restoration returned a path, use it
    if (typeof restoredPath === 'string') {
      processedPath = restoredPath;
      console.log(`Photo restoration successful: ${processedPath}`);
    } else {
      throw new Error('Photo restoration did not return a valid path');
    }

    
    // Step 3: Colorize photo
    console.log(`Starting photo colorization for ${processedPath}`);
    const colorizedPath = await colorizePhoto(processedPath);
    
    // If colorization returned a path, use it
    if (typeof colorizedPath === 'string') {
      processedPath = colorizedPath;
      console.log(`Photo colorization successful: ${processedPath}`);
    } else {
      throw new Error('Photo colorization did not return a valid path');
    }

    const timestampFolder = Date.now().toString();
    const finalPath = await saveImageLocally(
      processedPath, 
      timestampFolder, 
      "connection_of_generations.jpg"
    );
    // Step 4: Post-process the final image
    console.log(`Starting post-processing for ${processedPath}`);
    const {postProcessingImage} = await import('../services/post-processing');
    const postProcessedPath = await postProcessingImage(finalPath, finalPath);
    
    // If post-processing returned a path, use it
    if (typeof postProcessedPath === 'string') {
      processedPath = postProcessedPath;
      console.log(`Post-processing successful: ${processedPath}`);
    } else {
      throw new Error('Post-processing did not return a valid path');
    }

    // After post-processing, save with standard name


    return finalPath;
  } catch (error) {
    Logger.error(error, { 
      context: 'restoration-worker', 
      method: 'processPhoto', 
      photoPath,
      hasCreases
    });
    // Rethrow the error to be handled by the caller
    throw error;
  }
}

// Get image dimensions
async function getImageDimensions(imagePath: string): Promise<{ width: number, height: number }> {
  // In a real implementation, we would use a library like sharp or jimp
  // For now, we'll return default values
  return { width: 1024, height: 1024 };
}

// Send restoration results to user
async function sendRestorationResults(jobData: RestorationJob, restoredImage: { path: string, width: number, height: number }) {
  const { chatId, messageId, generationId } = jobData;
  
  if (!chatId) return;
  
  try {
    
    // Delete the status message
    await redisPublisher.publish('bot:delete_message', JSON.stringify({
      chatId,
      messageId
    }));
    
    // Get user for referral code
    const user = await prisma.user.findUnique({
      where: { id: jobData.userId }
    });
    
    const referralCode = user?.referralCode || '';
    
    // Check if the image is a URL or local path
    const isUrl = typeof restoredImage.path === 'string' && restoredImage.path.startsWith('http');
    
    // Send the restored image
    await redisPublisher.publish('bot:send_restoration', JSON.stringify({
      chatId,
      imageData: {
        path: restoredImage.path,
        width: restoredImage.width || 1024,
        height: restoredImage.height || 1024,
        isUrl: isUrl
      },
      userId: jobData.userId,
      language: jobData.language,
      referralCode
    }));
    

  } catch (error) {
    Logger.error(error, {
      context: 'restoration-worker',
      method: 'sendRestorationResults',
      generationId: jobData.generationId,
      chatId: jobData.chatId
    });
    
    // Try to send a direct error message if publishing to Redis failed
    try {
      await redisPublisher.publish('bot:send_message', JSON.stringify({
        chatId,
        text: 'Error sending restoration results. Please try again.',
        parseMode: 'HTML'
      }));
    } catch (msgError) {
      Logger.error(msgError, {
        context: 'restoration-worker',
        method: 'sendRestorationResults.errorMessage',
        generationId: jobData.generationId,
        chatId: jobData.chatId
      });
    }
  }
}

// Handle restoration errors
async function handleRestorationError(job: Job<RestorationJob>, error: any) {
  const { chatId, messageId, generationId } = job.data;
  
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
  
  Logger.error(error, {
    context: 'restoration-worker',
    method: 'handleRestorationError',
    jobId: job.id,
    generationId,
    chatId,
    errorMessage
  });

  try {
    // Update generation status to failed with the specific error message
    if (generationId) {
      await updateRestorationStatus(
        generationId, 
        GenerationStatus.FAILED, 
        [], 
        errorMessage
      );
    }

    // Notify the user about the failure if we have chat info
    if (chatId && messageId) {
      // Get user's language
      const userLang = job.data.language;
      
      // Create a more descriptive error message based on the error type
      let translationKey = 'bot:generate.error';
      let translationParams: any = {
        supportUsername: process.env.TELEGRAM_SUPPORT_USERNAME || 'avato_memory_help_bot'
      };
    
      
      // Get localized error message
      const text = i18next.t(translationKey, { 
        lng: userLang,
        ...translationParams
      });
      
      try {
        await redisPublisher.publish('bot:status_update', JSON.stringify({
          chatId,
          messageId,
          text,
          parseMode: 'HTML'
        }));
      } catch (telegramError) {
        Logger.error(telegramError, { 
          context: 'restoration-worker', 
          method: 'handleRestorationError.sendMessage', 
          chatId: job.data.chatId,
          messageId: job.data.messageId
        });
      }
    }
  } catch (updateError) {
    Logger.error(updateError, { 
      context: 'restoration-worker', 
      method: 'handleRestorationError.updateStatus',
      generationId: generationId
    });
  }
}

// Set up worker event handlers
function setupWorkerEvents(worker: Worker) {
  worker.on('failed', (job: Job | undefined, error: Error) => {
    Logger.error(`Job ${job?.id || 'unknown'} failed: ${error.message}`, { context: 'restoration-worker', jobId: job?.id });
  });

  worker.on('error', (error: Error) => {
    Logger.error(`Worker error: ${error.message}`, { context: 'restoration-worker' });
  });
}

// Graceful shutdown handler
const gracefulShutdown = async () => {
  console.info('Shutting down generation worker...');
  await worker.close();
  await redisPublisher.quit();
  await redisConnection.quit();
  console.info('Generation worker shut down successfully');
  
  // If running in a worker thread, notify the parent that we're shutting down
  if (!isMainThread && parentPort) {
    parentPort.postMessage({ type: 'shutdown', success: true });
  }
};

// Register shutdown handlers
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Initialize directories
initializeDirectories();

// Create and initialize worker
const worker = createWorker();

// Set up worker events
setupWorkerEvents(worker);

// If running in a worker thread, notify the parent that we're ready
if (!isMainThread && parentPort) {
  parentPort.postMessage({ type: 'ready', worker: workerData?.workerName || 'generationWorker' });
  
  // Listen for messages from the parent thread
  parentPort.on('message', (message) => {
    if (message.type === 'shutdown') {
      gracefulShutdown().catch(error => {
        console.error('Error during worker shutdown:', error);
        process.exit(1);
      });
    }
  });
}

// Export the worker
export default worker;

// Handler for crease removal errors
async function handleCreaseRemovalError(jobData: RestorationJob, error: any, photoPath: string) {
  const { chatId, messageId, language, generationId } = jobData;
  if (!chatId || !messageId) return;
  
  try {
    // Get localized message for crease removal error
    const errorMessage = i18next.t('bot:generate.crease_removal_error', { 
      lng: language || 'en'
    });
    
    // Create buttons for user choice
    const yesText = i18next.t('bot:generate.continue_without_creases_yes', { lng: language || 'en' });
    const noText = i18next.t('bot:generate.continue_without_creases_no', { lng: language || 'en' });
    
    // Publish message to Redis channel for bot to send to user
    await redisPublisher.publish('bot:crease_error_choice', JSON.stringify({
      chatId,
      messageId,
      text: errorMessage,
      parseMode: 'HTML',
      jobData: {
        generationId,
        userId: jobData.userId,
        originalPhotoPath: photoPath,
        hasCreases: true,
        fileId: jobData.fileId,
        language: jobData.language,
        chatId: jobData.chatId
      },
      buttons: [
        { text: yesText, callback_data: `retry_no_creases:${generationId}` },
        { text: noText, callback_data: `cancel_generation:${generationId}` }
      ]
    }));
    
  } catch (error) {
    Logger.error(error, {
      context: 'restoration-worker',
      method: 'handleCreaseRemovalError',
      generationId: jobData.generationId
    });
  }
}
