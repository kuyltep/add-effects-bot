import { GenerationPackageType } from '../../services/payment';

/**
 * Types of wizard steps in the generation process
 */
export type GenerationStep = 
  | 'prompt'
  | 'negativePrompt'
  | 'seed'
  | 'batchSize'
  | 'processing';

/**
 * Types of wizard scene actions
 */
export type SceneAction = 
  | 'skip_negative'
  | 'random_seed'
  | 'cancel'
  | 'invite_friend'
  | 'subscribe'
  | 'generate_more';

/**
 * Types of scene transition directions
 */
export enum TransitionDirection {
  NEXT = 'next',
  PREVIOUS = 'previous',
  EXIT = 'exit',
}

/**
 * Configuration for a scene step
 */
export interface SceneStepConfig {
  /** Unique identifier for the step */
  id: GenerationStep;
  /** Message key for instructions */
  instructionKey: string;
  /** Whether this step has actions/buttons */
  hasActions: boolean;
  /** Whether this step can be skipped */
  isSkippable: boolean;
  /** Handler for validation errors */
  errorMessageKey?: string;
}

/**
 * Types of scenes available in the bot
 */
export enum SceneType {
  START = 'start',
  REFERRAL = 'referral',
  GENERATE = 'generate',
  SETTINGS = 'settings',
  HELP = 'help',
  LINKS = 'links',
  PACKAGES = 'packages',
  PAYMENT = 'payment',
  BALANCE = 'balance',
  VIDEO = 'video',
  UPGRADE = 'upgrade',
}

/**
 * Payment scene state
 */
export interface PaymentSceneState {
  packageType: GenerationPackageType;
}

/**
 * Start scene parameters
 */
export interface StartSceneParams {
  referralCode?: string;
}

/**
 * Video scene state
 */
export interface VideoSceneState {
  imagePath?: string;
  imagePaths?: string[];  // Keep for backward compatibility
  validImagePaths?: string[];
  selectedImagePath?: string;
  prompt?: string;
  selectedEffect?: string;
}

/**
 * Upgrade scene state
 */
export interface UpgradeSceneState {
  imagePath?: string;
  imagePaths?: string[];  // Keep for backward compatibility
  validImagePaths?: string[];
  selectedImagePath?: string;
} 