import { MiddlewareFn } from 'telegraf';
import { MyContext } from '../types';
import i18next from '../../i18n';
import { prisma } from '../../utils/prisma';

// Minimal i18n context to reduce memory usage
const minimalI18nContext = {
  en: {
    t: (key: string, options?: Record<string, any>) => {
      return i18next.t(key, { lng: 'en', ...options });
    },
    locale: 'en'
  },
  ru: {
    t: (key: string, options?: Record<string, any>) => {
      return i18next.t(key, { lng: 'ru', ...options });
    },
    locale: 'ru'
  }
};

// Language detection based on user settings or fallback to user language code
export const detectLanguage = async (ctx: MyContext): Promise<string> => {
  // Try to get the user from database if telegramId is available
  if (ctx.from?.id) {
    try {
      const telegramId = ctx.from.id.toString();
      
      // Simplified query that uses less memory
      const result = await prisma.$queryRaw<{language: string}[]>`
        SELECT us."language" 
        FROM "UserSettings" us
        JOIN "User" u ON us."userId" = u.id
        WHERE u."telegramId" = ${telegramId}
        LIMIT 1
      `;
      
      // If we got results with language
      if (result && result.length > 0 && result[0].language) {
        const lang = result[0].language.toLowerCase();
        return lang === 'ru' ? 'ru' : 'en'; // Only support en and ru
      }
    } catch (error) {
      // Just log error code to reduce string allocations
      console.error('Language detection DB error:', error.code || 'unknown');
    }
  }
  
  // Fallback to language from Telegram client - but keep it minimal
  if (ctx.from?.language_code) {
    return ctx.from.language_code.startsWith('ru') ? 'ru' : 'en';
  }
  
  // Default to English
  return 'en';
};

// Single source for i18n context creation to reduce memory usage
export const createI18nContext = (lang: string) => {
  // Only support 'en' and 'ru' to reduce branching and memory
  return lang === 'ru' ? minimalI18nContext.ru : minimalI18nContext.en;
};

// Create middleware for i18n in Telegraf
export const i18nMiddleware = (): MiddlewareFn<MyContext> => async (ctx, next) => {
  try {
    // Detect language
    const lang = await detectLanguage(ctx);
    
    // Set context using our static references
    ctx.i18n = lang === 'ru' ? minimalI18nContext.ru : minimalI18nContext.en;
    
    // Continue processing
    return next();
  } catch (error) {
    // Basic error handling to avoid memory allocation in error objects
    console.error('i18n middleware error');
    ctx.i18n = minimalI18nContext.en; // Default to English on error
    return next();
  }
}; 