import { Resolution, Language } from "@prisma/client";

/**
 * Interface for user settings
 */
export interface UserSettings {
  /** User ID from database */
  userId: string;
  /** Whether to use negative prompts */
  useNegativePrompt: boolean;
  /** Whether to specify seed values */
  useSeed: boolean;
  /** Default number of images to generate */
  batchSize: number;
  /** Default image resolution */
  resolution: Resolution;
  /** Preferred generation model */
  model: string;

  language: string;
}

/**
 * Interface for settings update data
 */
export interface SettingsUpdateData {
  /** Whether to use negative prompts */
  useNegativePrompt?: boolean;
  /** Whether to specify seed values */
  useSeed?: boolean;
  /** Default number of images to generate */
  batchSize?: number;
  /** Default image resolution */
  resolution?: Resolution;
  /** Preferred generation model */
  model?: string;
} 