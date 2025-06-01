import fs from 'fs';
import path from 'path';
import RunwayML from '@runwayml/sdk';
import { resizeImage } from './sharp-service';
import { saveImageBuffer } from './sharp-service';
import { Resolution } from '../types/bot';
import { Logger } from '../utils/rollbar.logger';

const PHOTOS_AMOUNT = 2;

const client = new RunwayML({
  apiKey: process.env.RUNWAYML_API_KEY,
});

function getBase64Image(imagePath: string) {
  // Read the image file
  const imageBuffer = fs.readFileSync(imagePath);

  // Convert to base64
  const base64String = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).slice(1).toLowerCase() || 'jpeg';
  return `data:image/${ext};base64,${base64String}`;
}

export async function generateJointPhoto(
  imagePaths: string[],
  prompt: string,
  resolution: Resolution
): Promise<string> {
  const base64Images = imagePaths.map(getBase64Image);
  if (imagePaths.length !== PHOTOS_AMOUNT) {
    throw new Error(`Exactly ${PHOTOS_AMOUNT} images are required for joint photo generation`);
  }
  const ratio = resolution === 'SQUARE' ? '1024:1024' : resolution === 'VERTICAL' ? '1080:1920' : '1920:1080';
  try {
    // Create a new text-to-image task using the "gen4_image" model
    const textToImage = await client.textToImage.create({
      model: 'gen4_image',
      promptText: `${prompt}. Use photo @first_photo and @second_photo as reference.`,
      ratio: ratio,
      referenceImages: [
        {
          uri: base64Images[0],
          tag: 'first_photo',
        },
        {
          uri: base64Images[1],
          tag: 'second_photo',
        },
      ],
    });
    const taskId = textToImage.id;

    let task: Awaited<ReturnType<typeof client.tasks.retrieve>>;
    do {
      // Wait for 1 second before polling
      await new Promise(resolve => setTimeout(resolve, 1000));

      task = await client.tasks.retrieve(taskId);
    } while (!['SUCCEEDED', 'FAILED'].includes(task.status));

    if (task.status !== 'SUCCEEDED') {
      throw new Error(
        `Failed to generate image: ${task.failure}, failure code: ${task.failureCode}`
      );
    }

    const resultUrl = task.output[0];

    const response = await fetch(resultUrl);
    if (!response.ok) {
      throw new Error(`Failed to download result image: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const resultBuffer = Buffer.from(buffer);

    const outputDir = path.dirname(imagePaths[0]);
    const outputPath = path.resolve(outputDir, 'processed_image.jpg');
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
    Logger.error(`Error applying image effect: ${error.message}`);
    throw error;
  }
}
