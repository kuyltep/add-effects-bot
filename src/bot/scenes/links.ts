import { Scenes } from 'telegraf';
import { getMainKeyboard } from '../keyboards';
import { MyContext } from '../types';

// Create the links scene
export const linksScene = new Scenes.BaseScene<MyContext>('links');

// Scene enter handler
linksScene.enter(async ctx => {
  try {
    // Display links information
    await ctx.reply(ctx.i18n.t('bot:links.info'), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: getMainKeyboard(ctx.i18n.locale || 'en').reply_markup,
    });

    // Auto leave the scene after displaying links
    return ctx.scene.leave();
  } catch (error) {
    console.error('Error in links scene:', error);
    await ctx.reply(ctx.i18n.t('bot:errors.general'));
    return ctx.scene.leave();
  }
});

// Handle /cancel command
linksScene.command('cancel', async ctx => {
  await ctx.reply(ctx.i18n.t('bot:errors.cancelled'));
  return ctx.scene.leave();
});
