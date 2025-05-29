import fs from 'fs';
import { Logger } from '../utils/rollbar.logger';
import path from 'path';
import { Resolution } from '@prisma/client';
import { convertToPng, resizeImage } from './sharp-service';
import axios from 'axios';
import FormData from 'form-data';

// Base prompt template for consistent style transfer
const BASE_PROMPT_TEMPLATE =
  'Take this (these) generative person(s) and create a new picture in {style} style. Please, preserve and transfer the facial features of the generative character(s) as much as possible into the new style.';

// Style definitions for each effect
const STYLE_DEFINITIONS = {
  pixar: 'pixar studio 3d animation',
  ghibli: 'ghibli studio anime',
  claymation: 'Aardman cartoon style',
  bratz:
    'BRATZ style action doll made of soft-touch plastic. The doll should stand in a brown box, in a recess. There should be accessories in the recesses near the doll',
  cat: 'photorealistic animal(s) - cat(s)',
  dog: 'photorealistic animal(s) - dog(s)',
  sticker: 'sticker style',
  new_disney: 'disney style',
  old_disney: 'old disney cartoon style',
  mitchells: 'in The Mitchells vs. the Machines style',
  dreamworks: 'DreamWorks cartoon style',
};

// Generate full prompts from the template
const prompts = Object.entries(STYLE_DEFINITIONS).reduce((result, [effect, style]) => {
  result[effect] = BASE_PROMPT_TEMPLATE.replace('{style}', style);
  return result;
}, {});

// Logo styling prompt template
const LOGO_PROMPT_TEMPLATE =
  'Create a stylized logo with the following style properties: {styleProperties}. The input image should be used as the logo basis. Make sure the result maintains recognizability while applying the style.';

// Banner styling prompt template
const BANNER_PROMPT_TEMPLATE =
  'Create a stylized banner with the following style properties: {styleProperties}. The input image should be used as the banner basis. Make sure the result maintains recognizability while applying the style.';

// Banner creating image prompt template
const BANNER_PROMPT_TEMPLATE_WITHOUT_PHOTO =
  'Create a stylized banner with the following style properties: {styleProperties}. The input description should be used as the banner basis.';

export async function createImageOpenAI(
  outputDir: string,
  effect: string,
  resolution: Resolution = 'SQUARE',
  logoEffect?: string,
  bannerEffect?: string,
  roomDesignEffect?: string,
  prompt?: string
): Promise<string> {
  try {
    await fs.promises.mkdir(outputDir, { recursive: true });

    if (bannerEffect) {
      return await createBannerWithEffect(outputDir, bannerEffect, prompt, resolution);
    }

    // Validate regular effect type
    if (!effect) {
      throw new Error('No effect specified and no logo effect provided');
    }

    if (!prompts[effect]) {
      Logger.warn(`Unknown effect type: ${effect}, using default prompt`);
    }

    // Process with standard effects
    return await createImageWithQuality(
      outputDir,
      prompts[effect] || 'Create a cute stylized hero image',
      'medium',
      resolution
    );
  } catch (error) {
    Logger.error(`Error in OpenAI image creating: ${error.message}`, {
      effect,
      resolution,
      logoEffect,
      bannerEffect,
    });
    throw error;
  }
}

export async function editImageOpenAI(
  imagePath: string,
  effect: string,
  resolution: Resolution = 'SQUARE',
  logoEffect?: string,
  bannerEffect?: string,
  description?: string
): Promise<string> {
  try {
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found at path: ${imagePath}`);
    }

    // Create a proper PNG version of the input image for OpenAI API
    const pngPath = await convertToPng(imagePath);

    // If this is a logo effect, use the logo styling prompt
    if (logoEffect) {
      return await editLogoWithEffect(pngPath, logoEffect, resolution);
    }

    if (bannerEffect) {
      return await editBannerWithEffect(pngPath, bannerEffect, description, resolution);
    }

    // Validate regular effect type
    if (!effect) {
      throw new Error('No effect specified and no logo effect provided');
    }

    if (!prompts[effect]) {
      Logger.warn(`Unknown effect type: ${effect}, using default prompt`);
    }

    // Process with standard effects
    return await editImageWithQuality(
      pngPath,
      prompts[effect] || 'Create a cute stylized hero image',
      'medium',
      resolution
    );
  } catch (error) {
    Logger.error(`Error in OpenAI image editing: ${error.message}`, {
      effect,
      imagePath,
      resolution,
      logoEffect,
    });
    throw error;
  }
}

/**
 * Processes logo with the specified effect style
 */
export async function editLogoWithEffect(
  imagePath: string,
  logoEffect: string,
  resolution: Resolution = 'SQUARE'
): Promise<string> {
  try {
    // Load the effect JSON file
    const effectFilePath = path.join(process.cwd(), 'src', 'prompts', `${logoEffect}.json`);

    if (!fs.existsSync(effectFilePath)) {
      throw new Error(`Logo effect file not found: ${effectFilePath}`);
    }

    // Read and parse the effect JSON
    const effectData = JSON.parse(fs.readFileSync(effectFilePath, 'utf8'));

    // Convert the effect properties into a string for the prompt

    // Create the prompt with the style properties
    const prompt = LOGO_PROMPT_TEMPLATE.replace('{styleProperties}', JSON.stringify(effectData));

    // Process with OpenAI using high quality for logos
    return await editImageWithQuality(imagePath, prompt, 'medium', resolution);
  } catch (error) {
    Logger.error(`Error in logo effect processing: ${error.message}`, {
      logoEffect,
      imagePath,
    });
    throw error;
  }
}

export async function editBannerWithEffect(
  imagePath: string,
  bannerEffect: string,
  description: string = '',
  resolution: Resolution = 'SQUARE'
): Promise<string> {
  try {
    // Load the effect JSON file
    const effectFilePath = path.join(process.cwd(), 'src', 'prompts', `${bannerEffect}.json`);

    if (!fs.existsSync(effectFilePath)) {
      throw new Error(`Banner effect file not found: ${effectFilePath}`);
    }

    // Read and parse the effect JSON
    const effectData = JSON.parse(fs.readFileSync(effectFilePath, 'utf8'));
    effectData.description = description;

    // Convert the effect properties into a string for the prompt

    // Create the prompt with the style properties
    const prompt = BANNER_PROMPT_TEMPLATE.replace('{styleProperties}', JSON.stringify(effectData));

    // Process with OpenAI using high quality for logos
    return await editImageWithQuality(imagePath, prompt, 'medium', resolution);
  } catch (error) {
    Logger.error(`Error in banner effect processing: ${error.message}`, {
      bannerEffect,
      imagePath,
    });
    throw error;
  }
}

export async function createBannerWithEffect(
  outputDir: string,
  bannerEffect: string,
  description: string = '',
  resolution: Resolution = 'SQUARE'
): Promise<string> {
  try {
    // Load the effect JSON file
    const effectFilePath = path.join(process.cwd(), 'src', 'prompts', `${bannerEffect}.json`);

    if (!fs.existsSync(effectFilePath)) {
      throw new Error(`Banner effect file not found: ${effectFilePath}`);
    }

    // Read and parse the effect JSON
    const effectData = JSON.parse(fs.readFileSync(effectFilePath, 'utf8'));
    effectData.description = description;

    // Convert the effect properties into a string for the prompt

    // Create the prompt with the style properties
    const prompt = BANNER_PROMPT_TEMPLATE_WITHOUT_PHOTO.replace(
      '{styleProperties}',
      JSON.stringify(effectData)
    );

    // Process with OpenAI using high quality for banners
    return await createImageWithQuality(outputDir, prompt, 'medium', resolution);
  } catch (error) {
    Logger.error(`Error in banner effect processing(banner creating): ${error.message}`, {
      bannerEffect,
      outputDir,
    });
    throw error;
  }
}

export async function createImageWithQuality(
  outputDir: string,
  prompt: string,
  quality: 'medium' | 'high' = 'medium',
  resolution: Resolution = 'SQUARE'
): Promise<string> {
  try {
    // Log the request

    const response = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
        prompt: prompt,
        n: 1,
        quality: quality,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    if (response.data && response.data.data && response.data.data.length > 0) {
      // Extract URL or base64 content
      if (response.data.data[0].url) {
        // If we get a URL, download the image
        const imageResponse = await axios.get(response.data.data[0].url, {
          responseType: 'arraybuffer',
        });
        const outputPath = path.join(process.cwd(), outputDir, 'processed_image.jpg');
        fs.writeFileSync(outputPath, Buffer.from(imageResponse.data));
        const resultPath = path.join(process.cwd(), outputDir, 'effect_image.jpg');
        await resizeImage(outputPath, resolution, resultPath);
        return resultPath;
      } else if (response.data.data[0].b64_json) {
        // Handle base64 response
        const imageData = response.data.data[0].b64_json;
        const imageBuffer = Buffer.from(imageData, 'base64');
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
        quality,
      }
    );
    throw error;
  }
}

export async function editImageWithQuality(
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
