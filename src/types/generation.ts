/**
 * Status of generation process
 */
export type GenerationStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Job data for image generation tasks
 */
export interface GenerationJob {
  /** User ID from database */
  userId: string;
  /** Generation prompt text */
  prompt: string;

  /** Negative prompt for excluding elements */
  negativePrompt?: string;
  /** Seed for reproducible results, -1 for random */
  seed: number;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Number of images to generate */
  batchSize: number;
  /** Model used for generation */
  model: string;
  /** Generation ID for tracking purposes */
  generationId?: string;
  /** Translated prompt (if translation was applied) */
  translatedPrompt?: string;
  /** Chat ID for sending responses */
  chatId?: string;
  /** Message ID for updating status */
  messageId?: number;
  /** User language code */
  language: string;
}

/**
 * Job data for photo restoration tasks
 */
export interface RestorationJob {
  /** User ID from database */
  userId: string;
  /** Telegram file ID of the photo to restore */
  fileId: string;
  /** Whether the photo has creases that need removal */
  hasCreases: boolean;
  /** Generation ID for tracking purposes */
  generationId?: string;
  /** Chat ID for sending responses */
  chatId?: string;
  /** Message ID for updating status */
  messageId?: number;
  /** User language code */
  language: string;

    /** New properties for crease removal retry */
  isRetryWithoutCreases?: boolean;
    /** Original photo path */
  originalPhotoPath?: string;
}

/**
 * Result of the generation process
 */
export interface GenerationResult {
  /** Status of the generation process */
  status: 'completed' | 'failed';
  /** URLs to generated images */
  imageUrls?: string[];
  /** Error message if generation failed */
  error?: string;
}

/**
 * Response data to send to the user
 */
export interface GenerationResponse {
  /** Chat ID to send the response to */
  chatId: string;
  /** Array of image data */
  images: Array<{
    /** Path to the image file */
    path: string;
    /** Image width */
    width: number;
    /** Image height */
    height: number;
  }>;
  /** Original prompt */
  prompt: string;
  /** Translated prompt (if translation was applied) */
  finalPrompt?: string;
  /** Whether prompt was translated */
  isTranslated: boolean;
  /** Negative prompt used */
  negativePrompt?: string;
  /** Seed used for generation */
  seed: number;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** User ID */
  userId: string;
  /** User language code */
  language: string;
}
