import path from 'path';
import fs from 'fs';
import { prisma } from '../utils/prisma';
import { GenerationStatus } from '@prisma/client';
import { Logger } from '../utils/rollbar.logger';

/**
 * Parameters for photo restoration
 */
interface RestoreImageParams {
  userId: string;
  photoPath: string;
  hasCreases: boolean;
  generationId?: string;
  chatId?: string;
  messageId?: number;
}

/**
 * Restored image result
 */
interface RestoredImage {
  path: string;
  width: number;
  height: number;
}

/**
 * Result of the restoration process
 */
interface RestorationResult {
  images: RestoredImage[];
}

/**
 * Restores a photo with AI
 * @param params Restoration parameters
 * @returns The restoration result
 */
export async function restoreImage(params: RestoreImageParams): Promise<RestorationResult> {
  const { userId, photoPath, hasCreases, generationId, chatId, messageId } = params;
  
  try {
    // Create destination directory if it doesn't exist
    const restorationDir = path.join(process.env.UPLOAD_DIR || 'uploads', 'restorations', Date.now().toString());
    if (!fs.existsSync(restorationDir)) {
      fs.mkdirSync(restorationDir, { recursive: true });
    }
    
    // Generate output filename
    const outputFilename = `restored_photo.jpg`;
    const outputPath = path.join(restorationDir, outputFilename);
    
    // In a real implementation, here we would:
    // 1. If hasCreases is true, first remove creases with AI
    // 2. Then restore the photo with another AI model
    
    // For now, just copy the file as a simulation
    fs.copyFileSync(photoPath, outputPath);
    
    // Create the result
    const result: RestorationResult = {
      images: [
        {
          path: outputPath,
          width: 1024,
          height: 1024
        }
      ]
    };
    
    return result;
  } catch (error) {
    throw error;
  }
}

/**
 * Updates the status of a restoration job in the database
 * 
 * @param generationId - The ID of the generation record
 * @param status - The new status
 * @param imagePaths - Optional array of image paths (for completed status)
 * @param errorMessage - Optional error message (for failed status)
 */
export async function updateRestorationStatus(
  generationId: string,
  status: GenerationStatus,
  imagePaths: string[] = [],
  errorMessage?: string
): Promise<void> {
  try {
    const updateData: any = {
      status,
    };

    // Add image paths if provided
    if (imagePaths.length > 0 && status === GenerationStatus.COMPLETED) {
      updateData.imageUrls = imagePaths;
    }

    // Add error if provided
    if (errorMessage && status === GenerationStatus.FAILED) {
      updateData.error = errorMessage;
    }

    // Update the generation record
    await prisma.generation.update({
      where: { id: generationId },
      data: updateData,
    });


  } catch (error) {
    Logger.error(error, {
      context: 'restoration-service',
      method: 'updateRestorationStatus',
      generationId,
      status,
    });
    throw error;
  }
}

/**
 * Creates a new restoration job record in the database
 * 
 * @param userId - The user ID
 * @param fileId - The Telegram file ID of the photo
 * @param hasCreases - Whether the photo has creases
 * @returns The created generation record
 */
export async function createRestorationJob(
  userId: string,
  fileId: string,
  hasCreases: boolean
) {
  try {
    // Create a new generation record for restoration
    const generation = await prisma.generation.create({
      data: {
        userId,
        prompt: `Photo Restoration${hasCreases ? ' with crease removal' : ''}`,
        seed: Math.floor(Math.random() * 1000000),
        width: 512,
        height: 512,
        batchSize: 1,
        model: 'restoration',
        status: GenerationStatus.PENDING,
        imageUrls: [],
        translatedPrompt: `File ID: ${fileId}, Has Creases: ${hasCreases}`,
      },
    });



    return generation;
  } catch (error) {
    Logger.error(error, {
      context: 'restoration-service',
      method: 'createRestorationJob',
      userId,
    });
    throw error;
  }
}

/**
 * Get a user's restoration job count for the current day
 * 
 * @param userId - The user ID
 * @returns The number of restorations today
 */
export async function getUserDailyRestorationCount(userId: string): Promise<number> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const count = await prisma.generation.count({
      where: {
        userId,
        createdAt: {
          gte: today,
        },
        model: 'restoration',
      },
    });

    return count;
  } catch (error) {
    Logger.error(error, {
      context: 'restoration-service',
      method: 'getUserDailyRestorationCount',
      userId,
    });
    return 0;
  }
} 