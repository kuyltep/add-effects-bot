/**
 * Interface for image generation data
 */
export interface GenerationData {
  /** User ID from database */
  userId: string;
  /** Telegram user ID */
  telegramId: string;
  /** User's referral code */
  referralCode: string;
  /** Number of remaining generations */
  remainingGenerations: number;
  /** Whether user has active subscription */
  subscriptionActive: boolean;
  /** Generation prompt text */
  prompt?: string;
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
  /** Email for registration purposes */
  email?: string;
  /** Password for registration purposes */
  password?: string;
  /** File ID of the photo to restore */
  fileIds?: string[];
  /** Whether a photo was provided */
  hasPhoto?: boolean;
  /** Whether the photo has creases that need removal */
  hasCreases?: boolean;
}

/**
 * Interface for batch size options
 */
/**
 * Interface for image resolution options
 */
