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
  '🏦 Баланс': 'balance',
  '🫂 Рефералка': 'referral',
  '✨ Помощь': 'help',
  
  // English buttons
  '✨ Generate': 'generate',
  '🏦 Balance': 'balance',
  '🫂 Referral': 'referral',
  '✨ Help': 'help',
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

    // If this is a main keyboard button and we're in a scene
    if (targetScene && ctx.scene?.current) {
      const currentSceneId = ctx.scene.current.id;
      
      // Prevent infinite loops - don't transition to the same scene we're already in
      if (currentSceneId === targetScene) {
        return next();
      }
      
      
      // Leave current scene and enter target scene
      await ctx.scene.leave();
      return ctx.scene.enter(targetScene);
    }

    // Continue normal processing for non-keyboard messages or when not in a scene
    return next();
  };
} 