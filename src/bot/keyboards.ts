import { Markup } from 'telegraf';
import i18next from 'i18next';

// Function to generate the main keyboard layout based on locale
export function getMainKeyboard(locale: string = 'ru') {
  // Ensure locale exists in i18next resources
  const currentLocale = i18next.exists(locale) ? locale : 'ru';

  return Markup.keyboard([
    [
      Markup.button.text(i18next.t('bot:keyboard.generate', { lng: currentLocale })),
      Markup.button.text(i18next.t('bot:keyboard.account', { lng: currentLocale })),
    ],
    [
      Markup.button.text(i18next.t('bot:keyboard.referral', { lng: currentLocale })),
      Markup.button.text(i18next.t('bot:keyboard.settings', { lng: currentLocale })),
    ],
  ]).resize();
}
