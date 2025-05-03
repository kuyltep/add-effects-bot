import { Composer, Markup, Scenes } from 'telegraf';
import { MyContext } from '../../types/bot';
import { getMainKeyboard } from '../core'; // Импортируем для кнопки "Назад"

// Клавиатура для меню помощи
function getSupportMenuKeyboard(ctx: MyContext) {
  const lang = ctx.i18n.locale;
  return Markup.inlineKeyboard([
    [Markup.button.callback(ctx.i18n.t('bot:support_menu.button_help'), 'action_help')],
    [Markup.button.callback(ctx.i18n.t('bot:support_menu.button_links'), 'action_links')],
    [Markup.button.url(ctx.i18n.t('bot:support_menu.button_support'), `https://t.me/avato_memory_help_bot`)],
    // [Markup.button.callback(ctx.i18n.t('bot:support_menu.button_settings'), 'action_settings')],
    [Markup.button.callback(ctx.i18n.t('bot:support_menu.button_back'), 'action_back')]
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

stepHandler.action('action_back', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.reply('Возвращаемся в главное меню...', getMainKeyboard(ctx.i18n.locale));
  return ctx.scene.leave(); // Выходим из сцены
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
