import fs from 'fs';
import { Logger } from '../utils/rollbar.logger';
import path from 'path';
import { Resolution } from '@prisma/client';
import { convertToPng, resizeImage } from './sharp-service';
import axios from 'axios';
import FormData from 'form-data';

// Проверяем что переменные окружения загружены
const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
const openAIModel = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

// Логируем состояние конфигурации при загрузке модуля
Logger.info('OpenAI service configuration', {
  hasApiKey: hasOpenAIKey,
  apiKeyPrefix: process.env.OPENAI_API_KEY
    ? process.env.OPENAI_API_KEY.substring(0, 10) + '...'
    : 'NOT_SET',
  model: openAIModel,
});

if (!hasOpenAIKey) {
  Logger.error('OPENAI_API_KEY is not set! OpenAI image generation will fail.');
}

// Base prompt template for consistent style transfer
const BASE_PROMPT_TEMPLATE =
  'Take this (these) generative person(s) and create a new picture in {style} style. Please, preserve and transfer the facial features of the generative character(s) as much as possible into the new style.';
const BASE_PROMPT_TEMPLATE_WITH_EFFECT =
  'Create a stylized {effectType} with the following style properties: {styleProperties}. The input image should be used as the logo basis. Make sure the result maintains recognizability while applying the style.';

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
  roomDesignEffect?: string,
  jointPhotoEffect?: string,
  effectObject?: string,
  description?: string
): Promise<string> {
  try {
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found at path: ${imagePath}`);
    }

    // Create a proper PNG version of the input image for OpenAI API
    const pngPath = await convertToPng(imagePath);

    if (roomDesignEffect) {
      return await editImageWithEffect(
        pngPath,
        roomDesignEffect,
        effectObject,
        resolution,
        description
      );
    }

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
async function editImageWithEffect(
  imagePath: string,
  effect: string,
  effectObject: string,
  resolution: Resolution = 'SQUARE',
  description?: string
): Promise<string> {
  try {
    // Validate regular effect type
    if (!effect) {
      throw new Error('No effect specified');
    }

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
    const prompt = BASE_PROMPT_TEMPLATE_WITH_EFFECT.replace(
      '{styleProperties}',
      JSON.stringify(effectData)
    ).replace('{effectType}', effectObject);

    // Process with standard effects
    return await editImageWithQuality(imagePath, prompt, 'medium', resolution);
  } catch (error) {
    Logger.error('Error editing image with OpenAI', { error });
    throw error;
  }
}
/**
 * Processes logo with the specified effect style
 */
async function editLogoWithEffect(
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

async function editBannerWithEffect(
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

async function createBannerWithEffect(
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

async function createImageWithQuality(
  outputDir: string,
  prompt: string,
  quality: 'medium' | 'high' = 'medium',
  resolution: Resolution = 'SQUARE'
): Promise<string> {
  try {
    // Логируем запрос для отладки
    Logger.info('OpenAI image generation request', {
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
      prompt: prompt.substring(0, 100),
      quality,
      resolution,
    });

    const response = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
        prompt: prompt,
        n: 1,
        quality: quality,
        // gpt-image-1 по умолчанию возвращает b64_json, response_format не поддерживается
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      }
    );

    Logger.info('OpenAI generation response received', {
      hasData: !!response.data,
      dataLength: response.data?.data?.length || 0,
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      // gpt-image-1 возвращает только b64_json, не URL
      if (response.data.data[0].b64_json) {
        // Обрабатываем base64 ответ
        const imageData = response.data.data[0].b64_json;
        const imageBuffer = Buffer.from(imageData, 'base64');
        const outputPath = path.join(process.cwd(), outputDir, 'processed_image.jpg');
        fs.writeFileSync(outputPath, imageBuffer);
        const resultPath = path.join(process.cwd(), outputDir, 'effect_image.jpg');
        await resizeImage(outputPath, resolution, resultPath);

        Logger.info('Image generated successfully', { resultPath });
        return resultPath;
      } else {
        Logger.error('OpenAI generation response missing b64_json data', {
          responseData: response.data.data[0],
        });
        throw new Error('OpenAI API response missing b64_json data');
      }
    }

    Logger.error('OpenAI generation API invalid response structure', {
      responseData: response.data,
    });
    throw new Error('OpenAI API did not return valid image data');
  } catch (error) {
    Logger.error(
      `Error in OpenAI image generation API call: ${error.response?.data || error.message || error}`,
      {
        quality,
        hasApiKey: !!process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
      }
    );
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
    // gpt-image-1 по умолчанию возвращает b64_json, response_format не поддерживается

    Logger.info('OpenAI image edit request', {
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
      prompt: prompt.substring(0, 100),
      quality,
      resolution,
    });

    const response = await axios.post('https://api.openai.com/v1/images/edits', formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    });

    Logger.info('OpenAI response received', {
      hasData: !!response.data,
      dataLength: response.data?.data?.length || 0,
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      if (response.data.data[0].b64_json) {
        const imageData = response.data.data[0].b64_json;
        const imageBuffer = Buffer.from(imageData, 'base64');
        const outputDir = path.dirname(imagePath);
        const outputPath = path.join(outputDir, 'processed_image.jpg');
        fs.writeFileSync(outputPath, imageBuffer);
        const resultPath = path.join(outputDir, 'effect_image.jpg');
        await resizeImage(outputPath, resolution, resultPath);

        Logger.info('Image processed successfully', { resultPath });
        return resultPath;
      } else {
        Logger.error('OpenAI response missing b64_json data', {
          responseData: response.data.data[0],
        });
        throw new Error('OpenAI API response missing b64_json data');
      }
    }

    Logger.error('OpenAI API invalid response structure', { responseData: response.data });
    throw new Error('OpenAI API did not return valid image data');
  } catch (error) {
    Logger.error(
      `Error in OpenAI image edit API call: ${error.response?.data || error.message || error}`,
      {
        imagePath,
        quality,
        hasApiKey: !!process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
      }
    );
    throw error;
  }
}
