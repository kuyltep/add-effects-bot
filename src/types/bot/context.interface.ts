import { Context, Scenes } from 'telegraf';
import { PrismaClient } from '@prisma/client';
import { SceneName } from './wizard.interface';

/**
 * Interface for internationalization context
 */
export interface I18nContext {
  /** Translation function */
  t(key: string, params?: Record<string, any>): string;
  /** Current locale */
  locale: string;
}

/**
 * Interface for session data
 */
export interface SessionData {
  [key: string]: any;
}

// Define wizard session data type
export interface MyWizardSession extends Scenes.WizardSessionData {
  // Add any additional properties
  state: any;
}

/**
 * Extended context for Telegraf bot with scene, session, and wizard support
 */
export interface MyContext extends Context {
  /** Scene context with strongly typed scene names */
  scene: Scenes.SceneContextScene<MyContext, MyWizardSession>;
  /** Session storage for preserving state between updates */
  session: SessionData;
  /** Wizard context for multi-step scene flows */
  wizard: Scenes.WizardContextWizard<MyContext>;
  /** Internationalization helper */
  i18n: I18nContext;
  /** Prisma database client */
  prisma: PrismaClient;
}
