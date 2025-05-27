import { Scenes } from 'telegraf';
import { getMainKeyboard } from '../keyboards';
import { MyContext } from '../types';
import { handleSceneError, exitScene } from '../../services/scene';

// Create the help scene
export const helpScene = new Scenes.BaseScene<MyContext>('help');

/**
 * Displays help information to the user
 */
async function displayHelpInfo(ctx: MyContext): Promise<any> {
  await ctx.reply(ctx.i18n.t('bot:help.info'), {
    parse_mode: 'HTML',
    reply_markup: getMainKeyboard(ctx.i18n.locale || 'en').reply_markup,
  });

  // Auto leave the scene after displaying help info
  return ctx.scene.leave();
}

// Scene enter handler
helpScene.enter(async ctx => {
  try {
    return await displayHelpInfo(ctx);
  } catch (error) {
    return handleSceneError(ctx, error, 'help');
  }
});

// Handle /cancel command
helpScene.command('cancel', async ctx => {
  return exitScene(ctx, 'bot:errors.cancelled');
});
