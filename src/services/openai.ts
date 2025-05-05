import fs from "fs";
import OpenAI, { toFile } from "openai";
import { Logger } from "../utils/rollbar.logger";
import path from "path";
import sharp from "sharp";
import { Resolution } from "@prisma/client";
import { getResolutionDimensions } from "./settings";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

/**
 * Resizes an image to the specified resolution
 * @param imagePath Path to the image file
 * @param resolution Resolution type (SQUARE, VERTICAL, HORIZONTAL)
 * @returns Path to the resized image (same as input if no resize needed)
 */
async function resizeImageForProcessing(imagePath: string, resolution: Resolution, targetPath: string): Promise<string> {
  try {
    // Get target dimensions from resolution
    const dimensions = getResolutionDimensions(resolution);
    
    // Resize image using Sharp
    await sharp(imagePath)
      .resize(dimensions.width, dimensions.height, {
        fit: 'cover',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .toFormat('jpeg')
      .toFile(targetPath);
    
    return targetPath;
  } catch (error) {
    Logger.error(`Error resizing image: ${error.message}`, { imagePath, resolution });
    // Return original path if resize fails
    return imagePath;
  }
}

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
    
    // Create a proper PNG version of the input image regardless of original format
    const outputDir = path.dirname(imagePath);
    const pngPath = path.join(outputDir, `${path.basename(imagePath, path.extname(imagePath))}.png`);
    
    // Convert to PNG with proper dimensions for OpenAI API
    await sharp(imagePath)
      .resize(1024, 1024, {
        fit: 'cover',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .toFormat('png')
      .toFile(pngPath);
    
    // Create a readable stream from the PNG file
    const imageStream = fs.createReadStream(pngPath);
    const image = await toFile(imageStream, null, {
      type: "image/png",
    });

    const rsp = await client.images.edit({
      model: process.env.OPENAI_IMAGE_MODEL,
      image: image,
      prompt: prompts[effect] || "Create a cute stylized hero image",
    });

    // Prepare output path in the same directory as the input

    const outputPath = path.join(outputDir, "effect_image.jpg");
    // Save the image to the output path
    if (rsp.data[0].b64_json) {
      const image_base64 = rsp.data[0].b64_json;
      const image_bytes = Buffer.from(image_base64, "base64");
      fs.writeFileSync(pngPath, image_bytes);
      
      await resizeImageForProcessing(pngPath, resolution, outputPath);
      
      return outputPath;
    } else if (rsp.data[0].url) {
      // If we get a URL instead of base64, handle that case
      return outputPath;
    }

    throw new Error("OpenAI did not return image data or URL");
  } catch (error) {
    Logger.error(`Error in OpenAI image editing: ${error.message}`, {
      effect,
      imagePath,
      resolution,
    });
    throw error;
  }
}