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
    package100_name: packagesConfig.package100.name,
    package100_price: packagesConfig.package100.price,
    package100_count: packagesConfig.package100.count,
    
    package250_name: packagesConfig.package250.name,
    package250_price: packagesConfig.package250.price,
    package250_count: packagesConfig.package250.count,
    
    package500_name: packagesConfig.package500.name,
    package500_price: packagesConfig.package500.price,
    package500_count: packagesConfig.package500.count,
    
    package1000_name: packagesConfig.package1000.name,
    package1000_price: packagesConfig.package1000.price,
    package1000_count: packagesConfig.package1000.count,
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
