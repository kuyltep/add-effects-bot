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
  const settings = await prisma.userSettings.findUnique({
    where: { userId }
  });
  
  if (settings) return settings;
  
  return prisma.userSettings.create({
    data: {
      userId,
      resolution: 'SQUARE',
      language: 'RU',
    }
  });
}

/**
 * Обновление настроек пользователя
 * @param userId ID пользователя
 * @param data Данные для обновления
 * @returns Обновленные настройки пользователя
 */
export async function updateUserSettings(userId: string, data: any) {
  return prisma.userSettings.update({
    where: { userId },
    data
  });
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
  return Markup.inlineKeyboard([
    [Markup.button.callback(
      i18next.t('bot:settings.change_resolution', { lng: locale }),
      'change_resolution'
    )],

  ]);
}

/**
 * Создает клавиатуру для выбора разрешения.
 * @param locale Код языка ('ru' или 'en').
 * @returns Объект клавиатуры Telegraf Markup.
 */
export function createResolutionKeyboard(locale: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(
      i18next.t('bot:settings.resolution_square', { lng: locale }),
      'square'
    )],
    [Markup.button.callback(
      i18next.t('bot:settings.resolution_vertical', { lng: locale }),
      'vertical'
    )],
    [Markup.button.callback(
      i18next.t('bot:settings.resolution_horizontal', { lng: locale }),
      'horizontal'
    )]
  ]);
}


/**
 * Создает клавиатуру для выбора языка.
 * @returns Объект клавиатуры Telegraf Markup.
 */
export function createLanguageKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('English', 'lang_EN')],
    [Markup.button.callback('Русский', 'lang_RU')]
  ]);
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
    case 'SQUARE': return i18next.t('bot:settings.resolution_square', { lng: lang });
    case 'VERTICAL': return i18next.t('bot:settings.resolution_vertical', { lng: lang });
    case 'HORIZONTAL': return i18next.t('bot:settings.resolution_horizontal', { lng: lang });
    default: return i18next.t('bot:settings.resolution_square', { lng: lang }); // По умолчанию квадратное
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
    return i18next.t('bot:settings.language_ru', { lng: langForDisplay });
  } else {
    return i18next.t('bot:settings.language_en', { lng: langForDisplay });
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
  const languageText = getLocalizedLanguageName(lang, settings.language || 'EN');

  // Используем локализованный шаблон
  return i18next.t('bot:settings.info', {
    lng: lang,
    resolution: resolutionText,
    width: dimensions.width,
    height: dimensions.height,
    language: languageText,
  });
}
