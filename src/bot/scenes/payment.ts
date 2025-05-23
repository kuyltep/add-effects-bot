import { Scenes } from 'telegraf';
import { MyContext } from '../types';
import { handleSceneError, exitScene } from '../../services/scene';

// Create the payment scene (now just redirects to packages scene)
export const paymentScene = new Scenes.BaseScene<MyContext>('payment');

// Scene enter handler - redirect to packages scene
paymentScene.enter(async ctx => {
  try {
    // Redirect to the packages scene which now uses the payment microservice
    return ctx.scene.enter('packages');
  } catch (error) {
    return handleSceneError(ctx, error, 'payment');
  }
});

// Handle /cancel command
paymentScene.command('cancel', async ctx => {
  return exitScene(ctx, 'bot:errors.cancelled');
});
