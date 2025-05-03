import { Language, Resolution, UserSettings } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { MyContext } from '../types/bot/context.interface';
import { Markup } from 'telegraf';
import { Logger } from '../utils/rollbar.logger';
import i18next from 'i18next';

/**
 * Dimensions for different resolution types
 */
export interface ResolutionDimensions {
  width: number;
  height: number;
}

/**
 * Получение пользовательских настроек по ID пользователя
 * @param userId ID пользователя
 * @returns Настройки пользователя или null, если не найдены
 */
export async function getUserSettings(userId: string): Promise<UserSettings | null> {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    return settings;
  } catch (error) {
    Logger.error('Error getting user settings:', error);
    return null;
  }
}

/**
 * Создание или получение настроек пользователя
 * @param userId ID пользователя
 * @returns Настройки пользователя
 */
export async function getOrCreateUserSettings(userId: string): Promise<UserSettings> {
  try {
    // Проверяем существующие настройки
    let settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    // Если настроек нет, создаем их со значениями по умолчанию
    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          userId,
          useNegativePrompt: true,
          useSeed: false,
          batchSize: 1,
          resolution: 'SQUARE' as Resolution,
          model: 'rev3',
        },
      });
    }

    return settings;
  } catch (error) {
    Logger.error(error, { context: 'settings-service', method: 'getOrCreateUserSettings' });
    throw error;
  }
}

/**
 * Обновление настроек пользователя
 * @param userId ID пользователя
 * @param data Данные для обновления
 * @returns Обновленные настройки пользователя
 */
export async function updateUserSettings(
  userId: string,
  data: {
    useNegativePrompt?: boolean;
    useSeed?: boolean;
    batchSize?: number;
    resolution?: Resolution;
    model?: string;
    language?: Language;
  }
) {
  try {
    // Убеждаемся, что настройки существуют
    await getOrCreateUserSettings(userId);

    // Обновляем настройки
    const settings = await prisma.userSettings.update({
      where: { userId },
      data,
    });
    return settings;
  } catch (error) {
    Logger.error('Error updating user settings:', error);
    throw error;
  }
}

/**
 * Get width and height for a given resolution type
 */
export function getResolutionDimensions(resolution: Resolution): ResolutionDimensions {
  switch (resolution) {
    case 'SQUARE':
      return { width: 1024, height: 1024 };
    case 'VERTICAL':
      return { width: 768, height: 1024 };
    case 'HORIZONTAL':
      return { width: 1024, height: 768 };
    default:
      return { width: 1024, height: 1024 };
  }
}

/**
 * Создает инлайн-клавиатуру с кнопками настроек.
 * @param locale Код языка ('ru' или 'en').
 * @returns Объект клавиатуры Telegraf Markup.
 */
export function createSettingsKeyboard(locale: string) {
  const lang = locale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  return Markup.inlineKeyboard([
    [Markup.button.callback(i18next.t('bot:settings.keyboard.change_resolution', { lng: lang }), 'change_resolution')],
    [Markup.button.callback(i18next.t('bot:settings.keyboard.toggle_negative_prompt', { lng: lang }), 'toggle_negative_prompt')],
    [Markup.button.callback(i18next.t('bot:settings.keyboard.toggle_seed', { lng: lang }), 'toggle_seed')],
    [Markup.button.callback(i18next.t('bot:settings.keyboard.change_batch_size', { lng: lang }), 'change_batch_size')],
    [Markup.button.callback(i18next.t('bot:settings.keyboard.change_language', { lng: lang }), 'change_language')],
  ]).reply_markup;
}

/**
 * Создает клавиатуру для выбора разрешения.
 * @param locale Код языка ('ru' или 'en').
 * @returns Объект клавиатуры Telegraf Markup.
 */
export function createResolutionKeyboard(locale: string) {
  const lang = locale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  return Markup.inlineKeyboard([
    [Markup.button.callback(i18next.t('bot:settings.resolution.square', { lng: lang }), 'square')],
    [Markup.button.callback(i18next.t('bot:settings.resolution.vertical', { lng: lang }), 'vertical')],
    [Markup.button.callback(i18next.t('bot:settings.resolution.horizontal', { lng: lang }), 'horizontal')],
  ]).reply_markup;
}

/**
 * Создает клавиатуру для выбора размера пакета.
 * @returns Объект клавиатуры Telegraf Markup.
 */
export function createBatchSizeKeyboard() {
  // Кнопки с числами не требуют локализации
  return Markup.inlineKeyboard([
    [Markup.button.callback('1', 'batch_1')],
    [Markup.button.callback('2', 'batch_2')],
    [Markup.button.callback('3', 'batch_3')],
    [Markup.button.callback('4', 'batch_4')],
  ]).reply_markup;
}

/**
 * Создает клавиатуру для выбора языка.
 * @returns Объект клавиатуры Telegraf Markup.
 */
export function createLanguageKeyboard() {
  // Используем ключи для названий языков
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(i18next.t('bot:settings.language_name.en', { lng: 'en' }), 'lang_EN'), // Всегда показываем 'English'
      Markup.button.callback(i18next.t('bot:settings.language_name.ru', { lng: 'ru' }), 'lang_RU')  // Всегда показываем 'Русский'
    ]
  ]).reply_markup;
}

/**
 * Форматирует логическое значение для отображения в настройках.
 * @param locale Код языка ('ru' или 'en').
 * @param value Логическое значение.
 * @returns Строка 'Да'/'Нет' или 'Yes'/'No'.
 */
export function formatBooleanValue(locale: string, value: boolean): string {
  const lang = locale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  // Используем общие ключи common.yes и common.no
  return value ? i18next.t('common.yes', { lng: lang }) : i18next.t('common.no', { lng: lang });
}

/**
 * Получает локализованное имя разрешения.
 * @param locale Код языка ('ru' или 'en').
 * @param resolution Тип разрешения.
 * @returns Локализованное имя разрешения (например, 'Квадратное (1:1)').
 */
export function getLocalizedResolutionName(locale: string, resolution: Resolution): string {
  const lang = locale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  switch (resolution) {
    case 'SQUARE': return i18next.t('bot:settings.resolution.square', { lng: lang });
    case 'VERTICAL': return i18next.t('bot:settings.resolution.vertical', { lng: lang });
    case 'HORIZONTAL': return i18next.t('bot:settings.resolution.horizontal', { lng: lang });
    default: return i18next.t('bot:settings.resolution.square', { lng: lang }); // По умолчанию квадратное
  }
}

/**
 * Получает локализованное имя языка.
 * @param displayLocale Код языка, на котором нужно отобразить имя ('ru' или 'en').
 * @param languageCode Код языка, имя которого нужно отобразить ('RU' или 'EN').
 * @returns Локализованное имя языка (например, 'Русский' или 'English').
 */
export function getLocalizedLanguageName(displayLocale: string, languageCode: string): string {
  const langForDisplay = displayLocale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  const langCodeLower = languageCode?.toLowerCase() || 'en'; // По умолчанию 'en', если язык не установлен

  if (langCodeLower === 'ru') {
    return i18next.t('bot:settings.language_name.ru', { lng: langForDisplay });
  } else {
    return i18next.t('bot:settings.language_name.en', { lng: langForDisplay });
  }
}

/**
 * Форматирует информационное сообщение о настройках с текущими значениями.
 * @param locale Код языка ('ru' или 'en').
 * @param settings Объект настроек пользователя.
 * @param dimensions Объект с текущими размерами изображения.
 * @returns Отформатированная строка с информацией о настройках.
 */
export function formatSettingsInfo(locale: string, settings: UserSettings, dimensions: ResolutionDimensions): string {
  const lang = locale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  
  // Получаем локализованные значения
  const resolutionText = getLocalizedResolutionName(lang, settings.resolution);
  const useNegativePromptText = formatBooleanValue(lang, settings.useNegativePrompt);
  const useSeedText = formatBooleanValue(lang, settings.useSeed);
  const languageText = getLocalizedLanguageName(lang, settings.language || 'EN');

  // Получаем локализованные метки
  const resolutionLabel = i18next.t('bot:settings.resolution.label', { lng: lang });
  const negativePromptLabel = i18next.t('bot:settings.negative_prompt_label', { lng: lang });
  const randomSeedLabel = i18next.t('bot:settings.random_seed_label', { lng: lang });
  const batchSizeLabel = i18next.t('bot:settings.batch_size_label', { lng: lang });
  const languageLabel = i18next.t('bot:settings.language_label', { lng: lang });

  // Используем локализованный шаблон
  return i18next.t('bot:settings.info_template', {
    lng: lang,
    resolution_label: resolutionLabel,
    resolution: resolutionText,
    width: dimensions.width,
    height: dimensions.height,
    negative_prompt_label: negativePromptLabel,
    useNegativePrompt: useNegativePromptText,
    random_seed_label: randomSeedLabel,
    useSeed: useSeedText,
    batch_size_label: batchSizeLabel,
    batchSize: settings.batchSize,
    language_label: languageLabel,
    language: languageText,
  });
}
