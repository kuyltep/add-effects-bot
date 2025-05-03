import { Context, Scenes } from 'telegraf';
import { PrismaClient } from '@prisma/client';

// Данные генерации изображений
export interface GenerationData {
  userId: string;
  telegramId: string;
  referralCode: string;
  remainingGenerations: number;
  subscriptionActive: boolean;
  prompt?: string;
  negativePrompt?: string;
  seed: number;
  width: number;
  height: number;
  batchSize: number;
  model: string;
  // Дополнительные поля для регистрации
  email?: string;
  password?: string;
}

// Данные настроек пользователя
export interface SettingsData {
  userId: string;
}

// Define i18n interface
export interface I18nContext {
  t(key: string, params?: Record<string, any>): string;
  locale: string;
}

// Simple context that works with Telegraf's scene and session features
export interface MyContext extends Context {
  scene: any; // Using any to avoid complex typing issues
  session: any;
  wizard: any;
  i18n: I18nContext;
  prisma: PrismaClient;
}
