import { Markup } from 'telegraf';
import i18next from 'i18next';

// Function to generate the main keyboard layout based on locale
export function getMainKeyboard(locale: string = 'ru') {
  // Ensure locale exists in i18next resources
  const currentLocale = i18next.exists(locale) ? locale : 'ru';
  
  return Markup.keyboard([
    [
      Markup.button.text(i18next.t('bot:menu.generate', { lng: currentLocale })),
      Markup.button.text(i18next.t('bot:menu.balance', { lng: currentLocale }))
    ],
    [
      Markup.button.text(i18next.t('bot:menu.subscription', { lng: currentLocale })),
      Markup.button.text(i18next.t('bot:menu.referral', { lng: currentLocale })),
      Markup.button.text(i18next.t('bot:menu.settings', { lng: currentLocale }))
    ],
    [Markup.button.text(i18next.t('bot:menu.help', { lng: currentLocale }))]
  ]).resize();
} 