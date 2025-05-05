import { UserSettings } from './settings.interface';
import { Resolution } from './settings.type';
import { User } from '@prisma/client';
import { Context } from 'telegraf';
import { PrismaClient } from '@prisma/client';

/**
 * Base context interface extending Telegraf's Context
 * Includes session data and i18n support
 */
export interface MyContext extends Context {
  session: any;
  i18n: {
    locale: (lang: string) => void;
    t: (key: string, options?: any) => string;
  };
  prisma: PrismaClient;
  scene: any; // Scenes.SceneContextScene<MyContext, Scenes.WizardSessionData>;
  wizard: any; //Scenes.WizardContextWizard<MyContext>;
}

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
  /** User language code */
  language?: string;
  telegramId: string;
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

// Define the possible effect types
export type EffectType = 'claymation' | 'ghibli' | 'pixar' | 'plushify' | 'ghiblify' | 'cartoonify';

/**
 * Data specific to the generation process
 */
export interface GenerationData {
  prompt?: string;
  negativePrompt?: string;
  seed?: number;
  batchSize?: number;
  fileId?: string;
  hasPhoto?: boolean;
  effect?: EffectType;
} 