import fs from 'fs';
import { Logger } from '../utils/rollbar.logger';
import path from 'path';
import { Resolution } from '@prisma/client';
import { convertToPng, resizeImage } from './sharp-service';
import axios from 'axios';
import FormData from 'form-data';

// Logo styling prompt template
const BASE_PROMPT_TEMPLATE =
  'Create a stylized {effectType} with the following style properties: {styleProperties}. The input image should be used as the logo basis. Make sure the result maintains recognizability while applying the style.';

export async function editImageWithAnotherAi(
    imagePath: string,
    effect: string,
    effectType: string,
    resolution: Resolution = 'SQUARE',
    description?: string
): Promise<string> {
    try {
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found at path: ${imagePath}`);
      }
  
      // Validate regular effect type
      if (!effect) {
        throw new Error('No effect specified');
      }

      // Create a proper PNG version of the input image for OpenAI API
      const pngPath = await convertToPng(imagePath);
  
      // Load the effect JSON file
      const effectFilePath = path.join(process.cwd(), 'src', 'prompts', `${effect}.json`);

      if (!fs.existsSync(effectFilePath)) {
        throw new Error(`Effect file not found: ${effectFilePath}`);
      }

      // Read and parse the effect JSON
      const effectData = JSON.parse(fs.readFileSync(effectFilePath, 'utf8'));
      effectData.description = description;

      // Convert the effect properties into a string for the prompt

      // Create the prompt with the style properties
      const prompt = BASE_PROMPT_TEMPLATE.replace('{styleProperties}', JSON.stringify(effectData)).replace('{effectType}', effectType);

      // Process with standard effects
      return await editImageWithQuality(
          pngPath,
          prompt,
          'medium',
          resolution
        );
    } catch (error) {
        Logger.error('Error editing image with another AI', { error });
        throw error;
    }
}

async function editImageWithQuality(
    imagePath: string,
    prompt: string,
    quality: 'medium' | 'high' = 'medium',
    resolution: Resolution = 'SQUARE'
  ): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('image', fs.createReadStream(imagePath), { filename: 'input.png' });
      formData.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1');
      formData.append('prompt', prompt);
      formData.append('n', '1');
      formData.append('quality', quality);
  
      // Log the request
  
      const response = await axios.post('https://api.openai.com/v1/images/edits', formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      });
  
      if (response.data && response.data.data && response.data.data.length > 0) {
        // Extract URL or base64 content
        if (response.data.data[0].url) {
          // If we get a URL, download the image
          const imageResponse = await axios.get(response.data.data[0].url, {
            responseType: 'arraybuffer',
          });
          const outputDir = path.dirname(imagePath);
          const outputPath = path.join(process.cwd(), outputDir, 'processed_image.jpg');
          fs.writeFileSync(outputPath, Buffer.from(imageResponse.data));
          const resultPath = path.join(process.cwd(), outputDir, 'effect_image.jpg');
          await resizeImage(outputPath, resolution, resultPath);
          return resultPath;
        } else if (response.data.data[0].b64_json) {
          // Handle base64 response
          const imageData = response.data.data[0].b64_json;
          const imageBuffer = Buffer.from(imageData, 'base64');
          const outputDir = path.dirname(imagePath);
          const outputPath = path.join(process.cwd(), outputDir, 'processed_image.jpg');
          fs.writeFileSync(outputPath, imageBuffer);
          const resultPath = path.join(process.cwd(), outputDir, 'effect_image.jpg');
          await resizeImage(outputPath, resolution, resultPath);
          return resultPath;
        }
      }
      throw new Error('OpenAI API did not return valid image data');
    } catch (error) {
      Logger.error(
        `Error in direct OpenAI API call: ${error.response?.data || error.message || error}`,
        {
          imagePath,
          quality,
        }
      );
      throw error;
    }
  }