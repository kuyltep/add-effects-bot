// Context types
import {
  I18nContext,
  SessionData,
  MyWizardSession,
  MyContext as ContextMyContext,
} from './context.interface';

// Generation types
import { GenerationData as GenerationInterfaceData } from './generation.interface';

// Settings types
export * from './settings.interface';
export * from './settings.type';

// Wizard state types
import {
  MyContext as WizardMyContext,
  WizardUserData,
  GenerateWizardState,
  SceneName,
  SettingsWizardState,
  EffectType,
  GenerationData as WizardGenerationData,
} from './wizard.interface';

// Scene types
export * from './scene.type';

// Re-export with explicit names
export {
  I18nContext,
  SessionData,
  MyWizardSession,
  ContextMyContext,
  GenerationInterfaceData,
  WizardMyContext,
  WizardUserData,
  GenerateWizardState,
  SceneName,
  SettingsWizardState,
  EffectType,
  WizardGenerationData,
};

// Use a type alias to define which version of MyContext to use as default
export type MyContext = ContextMyContext;
// Export renamed version of GenerationData to avoid conflicts
export type GenerationData = GenerationInterfaceData;
