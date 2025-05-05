import { Resolution, Language } from "@prisma/client";

/**
 * Interface for user settings
 */
export interface UserSettings {
  /** User ID from database */
  userId: string;
  /** Default image resolution */
  resolution: Resolution;
  /** User language preference */
  language: string;
}

/**
 * Interface for settings update data
 */
export interface SettingsUpdateData {
  /** Default image resolution */
  resolution?: Resolution;
  /** User language preference */
  language?: string;
} 