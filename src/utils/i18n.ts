export interface I18nTranslator {
  t: (key: string, params?: Record<string, any>) => string;
  locale: () => string;
}

import { packagesConfig } from '../config';

/**
 * Injects package configuration values into translations
 * This allows us to use dynamic values from environment variables in translations
 * @param key Translation key
 * @param params Additional parameters
 * @param translator i18n translator function
 * @returns Translated string with package values injected
 */
export function translateWithPackages(
  key: string,
  params: Record<string, any> = {},
  t: (key: string, params?: Record<string, any>) => string
): string {
  // Inject package details into translation params
  const paramsWithPackages = {
    ...params,
    // Inject each package's details
    package1_name: packagesConfig.package1.name,
    package1_price: packagesConfig.package1.price,
    package1_count: packagesConfig.package1.count,

    package2_name: packagesConfig.package2.name,
    package2_price: packagesConfig.package2.price,
    package2_count: packagesConfig.package2.count,

    package3_name: packagesConfig.package3.name,
    package3_price: packagesConfig.package3.price,
    package3_count: packagesConfig.package3.count,

    package4_name: packagesConfig.package4.name,
    package4_price: packagesConfig.package4.price,
    package4_count: packagesConfig.package4.count,
  };

  return t(key, paramsWithPackages);
}

// Создадим простую заглушку для i18n, чтобы сборка проходила без ошибок
export const createMockI18n = (): I18nTranslator => {
  return {
    t: (key: string, params?: Record<string, any>) => {
      return key;
    },
    locale: () => 'en',
  };
};
