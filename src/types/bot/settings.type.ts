/**
 * Resolution options for image generation
 */
export type Resolution = 'SQUARE' | 'VERTICAL' | 'HORIZONTAL';

/**
 * Setting action types available in the settings scene
 */
export type SettingsAction = 
  | 'change_resolution' 
  | 'toggle_negative_prompt'
  | 'toggle_seed' 
  | 'change_batch_size'
  | 'change_language'
  | 'square'
  | 'vertical'
  | 'horizontal'
  | 'batch_1'
  | 'batch_2'
  | 'batch_3'
  | 'batch_4'
  | 'lang_EN'
  | 'lang_RU';

/**
 * Configuration for a button in the settings menu
 */
export interface SettingsButtonConfig {
  /** The translation key for the button text */
  labelKey: string;
  /** The action that will be triggered when the button is clicked */
  action: SettingsAction;
} 