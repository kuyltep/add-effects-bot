/**
 * Utility functions for scene management
 */
import { Middleware } from 'telegraf';
import { MyContext } from '../types';
import { Logger } from './rollbar.logger';

// Define main keyboard button mapping for both languages
const MAIN_KEYBOARD_MAPPING = {
  // Russian buttons
  '✨ Создать': 'generate',
  '✨ Генерация': 'generate',
  '🫂 Рефералка': 'referral',
  '👤 Аккаунт': 'account',
  '✨ Помощь': 'supportMenu',
  '⚙️ Настройки': 'settings',
  
  // English buttons
  '✨ Generate': 'generate',
  '🏦 Balance': 'balance',
  '🫂 Referral': 'referral',
  '👤 Account': 'account',
  '✨ Help': 'supportMenu',
  '⚙️ Settings': 'settings',
};

/**
 * Create a stage-level middleware to handle main keyboard buttons globally 
 * 
 * This is designed to be registered at the stage level (not scene level)
 * to avoid infinite loops when transitioning between scenes.
 */
export function createMainKeyboardMiddleware(): Middleware<MyContext> {
  return async (ctx, next) => {
    // Only process text messages
    if (!ctx.message || !('text' in ctx.message)) {
      return next();
    }

    const text = ctx.message.text;
    const targetScene = MAIN_KEYBOARD_MAPPING[text];

    // If this is a main keyboard button
    if (targetScene) {
      
      // If we're in a scene
      if (ctx.scene?.current) {
        const currentSceneId = ctx.scene.current.id;
        
        if (currentSceneId === targetScene) {
          return next();
        }
        
        try {
          // Force leave current scene and enter target scene
          await ctx.scene.leave();
          return ctx.scene.enter(targetScene);
        } catch (error) {
          Logger.error(`Error transitioning scenes: ${error.message}`, {
            from: currentSceneId,
            to: targetScene,
            userId: ctx.from?.id
          });
          // Try to recover by force leaving and entering
          await ctx.scene.leave();
          return ctx.scene.enter(targetScene);
        }
      } else {
        // Not in a scene, just enter the target scene
        return ctx.scene.enter(targetScene);
      }
    }

    // Continue normal processing for non-keyboard messages or when not in a scene
    return next();
  };
} 