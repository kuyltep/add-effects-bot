import fs from "fs";
import { Logger } from "../utils/rollbar.logger";
import path from "path";
import { Resolution } from "@prisma/client";
import { convertToPng, resizeImage } from "./sharp-service";
import axios from "axios";
import FormData from "form-data";


// Base prompt template for consistent style transfer
const BASE_PROMPT_TEMPLATE = "Take this (these) generative person(s) and create a new picture in {style} style. Please, preserve and transfer the facial features of the generative character(s) as much as possible into the new style.";

// Style definitions for each effect
const STYLE_DEFINITIONS = {
  "pixar": "pixar studio 3d animation",
  "ghibli": "ghibli studio anime",
  "claymation": "claymation cartoon"
};

// Generate full prompts from the template
const prompts = Object.entries(STYLE_DEFINITIONS).reduce((result, [effect, style]) => {
  result[effect] = BASE_PROMPT_TEMPLATE.replace('{style}', style);
  return result;
}, {});

export async function editImageOpenAI(imagePath: string, effect: string, resolution: Resolution = 'SQUARE'): Promise<string> {
  try {
    // Validate effect type
    if (!prompts[effect]) {
      Logger.warn(`Unknown effect type: ${effect}, using default prompt`);
    }

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found at path: ${imagePath}`);
    }
    
    // Create a proper PNG version of the input image with 1024x1024 dimensions for OpenAI API
    const pngPath = await convertToPng(imagePath);
    


    return await editImageWithQuality(pngPath, prompts[effect] || "Create a cute stylized hero image", 'medium', resolution);
    // Process with OpenAI
    // const rsp = await client.images.edit({
    //   model: process.env.OPENAI_IMAGE_MODEL,
    //   image: image,
    //   n: 1,
      
    //   prompt: prompts[effect] || "Create a cute stylized hero image",
    // });

    // // Prepare output path in the same directory as the input
    // const outputDir = path.dirname(imagePath);
    // const outputPath = path.join(process.cwd(), outputDir, "processed_image.jpg");

    // // Save the image to the output path
    // if (rsp.data[0].b64_json) {
    //   const image_base64 = rsp.data[0].b64_json;
    //   const image_bytes = Buffer.from(image_base64, "base64");
    //   fs.writeFileSync(outputPath, image_bytes);
      
    //   // Resize the output image to the requested resolution
    //   const resultPath = path.join(process.cwd(), outputDir, "effect_image.jpg");
    //   await resizeImage(outputPath, resolution, resultPath);
      
    //   return resultPath;
    // } else if (rsp.data[0].url) {
    //   // If we get a URL instead of base64, handle that case
    //   return outputPath;
    // }

  } catch (error) {
    Logger.error(`Error in OpenAI image editing: ${error.message}`, {
      effect,
      imagePath,
      resolution,
    });
    throw error;
  }
}

export async function editImageWithQuality(imagePath: string, prompt: string, quality: 'medium' | 'high' = 'medium', resolution: Resolution = 'SQUARE'): Promise<string> {
  try {


    const formData = new FormData();
    formData.append('image', fs.createReadStream(imagePath), {filename:'input.png'});
    formData.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1');
    formData.append('prompt', prompt);
    formData.append('n', '1');
    formData.append('quality', quality);

    // Log the request


    const response = await axios.post('https://api.openai.com/v1/images/edits', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      // Extract URL or base64 content
      if (response.data.data[0].url) {
        // If we get a URL, download the image
        const imageResponse = await axios.get(response.data.data[0].url, { responseType: 'arraybuffer' });
        const outputDir = path.dirname(imagePath);
        const outputPath = path.join(process.cwd(), outputDir, "processed_image.jpg");
        fs.writeFileSync(outputPath, Buffer.from(imageResponse.data));
        const resultPath = path.join(process.cwd(), outputDir, "effect_image.jpg");
        await resizeImage(outputPath, resolution, resultPath);
        return resultPath;
      } else if (response.data.data[0].b64_json) {
        // Handle base64 response
        const imageData = response.data.data[0].b64_json;
        const imageBuffer = Buffer.from(imageData, 'base64');
        const outputDir = path.dirname(imagePath);
        const outputPath = path.join(process.cwd(), outputDir, "processed_image.jpg");
        fs.writeFileSync(outputPath, imageBuffer);
        const resultPath = path.join(process.cwd(), outputDir, "effect_image.jpg");
        await resizeImage(outputPath, resolution, resultPath);
        return resultPath;
      }
    }
    throw new Error('OpenAI API did not return valid image data');
  } catch (error) {
    Logger.error(`Error in direct OpenAI API call: ${error.response?.data || error.message || error}`, {
      imagePath,
      quality,
    });
    throw error;
  }
}