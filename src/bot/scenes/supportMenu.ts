import { Composer, Markup, Scenes } from 'telegraf';
import { getMainKeyboard } from '../keyboards'; // Импортируем для кнопки "Назад"
import { MyContext } from '../types';
import { handleSceneError, exitScene } from '../../services/scene';

// Клавиатура для меню помощи
function getSupportMenuKeyboard(ctx: MyContext) {
  const lang = ctx.i18n.locale;
  return Markup.inlineKeyboard([
    [Markup.button.callback(ctx.i18n.t('bot:support_menu.button_help', { locale: lang }), 'action_help')],
    [Markup.button.callback(ctx.i18n.t('bot:support_menu.button_links', { locale: lang }), 'action_links')],
    [Markup.button.url(ctx.i18n.t('bot:support_menu.button_support', { locale: lang }), `https://t.me/${process.env.TELEGRAM_SUPPORT_USERNAME}`)]
    // [Markup.button.callback(ctx.i18n.t('bot:support_menu.button_settings'), 'action_settings')],
  ]);
}

// Обработчик первого шага - показ меню
const stepHandler = new Composer<MyContext>();

stepHandler.action('action_help', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.scene.enter('help'); // Переходим в сцену help
});

stepHandler.action('action_links', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.scene.enter('links'); // Переходим в сцену links
});

stepHandler.action('action_settings', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.scene.enter('settings'); // Переходим в сцену settings
});

// Обработка любого другого сообщения или команды как выход из сцены
stepHandler.on('message', async (ctx) => {
  await ctx.reply('Выход из меню помощи...', getMainKeyboard(ctx.i18n.locale));
  return ctx.scene.leave();
});

// Создаем сцену
export const supportMenuScene = new Scenes.WizardScene<MyContext>(
  'supportMenu', // Имя сцены
  // Шаг 1: Показать меню
  async (ctx) => {
    await ctx.reply(ctx.i18n.t('bot:support_menu.welcome'), {
      parse_mode: 'HTML',
      reply_markup: getSupportMenuKeyboard(ctx).reply_markup,
    });
    return ctx.wizard.next(); // Переходим ко второму шагу для обработки кнопок
  },
  // Шаг 2: Обработка кнопок
  stepHandler
);

// Добавляем обработку команды /cancel для выхода
supportMenuScene.command('cancel', async (ctx) => {
  await ctx.reply('Действие отменено.', getMainKeyboard(ctx.i18n.locale));
  return ctx.scene.leave();
});
