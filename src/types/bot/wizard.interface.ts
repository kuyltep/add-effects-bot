import { GenerationData } from './generation.interface';
import { UserSettings } from './settings.interface';
import { Resolution } from './settings.type';

/**
 * Interface for user data stored in wizard state
 */
export interface WizardUserData {
  /** User ID from database */
  id: string;
  /** User email */
  email: string;
  /** Remaining available generations */
  remainingGenerations: number;
  /** Whether user has active subscription */
  subscriptionActive: boolean;
  /** User's referral code */
  referralCode: string;
}

/**
 * Interface for generation wizard state
 */
export interface GenerateWizardState {
  /** Generation data with additional properties */
  generationData: GenerationData & {
    /** User language code */
    language: string;
  };
  /** User data */
  userData: WizardUserData;
  /** User settings */
  userSettings: UserSettings;
}

/**
 * Type for scene names
 */
export type SceneName = 
  | 'start'
  | 'generate'
  | 'settings'
  | 'balance'
  | 'referral'
  | 'help'
  | 'links'
  | 'packages'
  | 'payment'
  | 'video'
  | 'upgrade';

/**
 * Settings wizard state interface
 */
export interface SettingsWizardState {
  /** User data for the current settings session */
  settingsData: {
    /** User ID from database */
    userId: string;
    /** Telegram user ID */
    telegramId: string;
  };
  /** Current settings being modified */
  currentSettings?: {
    /** Resolution setting */
    resolution: Resolution;
    /** Whether to use negative prompt */
    useNegativePrompt: boolean;
    /** Whether to use custom seed */
    useSeed: boolean;
    /** Batch size for image generation */
    batchSize: number;
    /** Model to use for generation */
    model?: string;
  };
} 