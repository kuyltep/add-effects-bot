import i18next from 'i18next';
import middleware from 'i18next-http-middleware';
import path from 'path';
import fs from 'fs';

function loadTranslations() {
  const languages = ['ru'];
  const resources = {};
  
  languages.forEach(lang => {
    try {
      const filePath = path.resolve(__dirname, `locales/${lang}/translation.json`);
      const fileContents = fs.readFileSync(filePath, 'utf8');
      const translations = JSON.parse(fileContents);
      
      resources[lang] = {
        translation: translations,
        bot: translations.bot // Add bot namespace for 'bot:' prefixed keys
      };
    } catch (error) {
      console.error(`Error loading translations for ${lang}:`, error);
    }
  });
  
  return resources;
}

// Initialize i18next
i18next
  .use(middleware.LanguageDetector) // Auto language detection
  .init({
    fallbackLng: 'ru',
    supportedLngs: ['en', 'ru'],
    resources: loadTranslations(),
    interpolation: {
      escapeValue: false,
    },
  });

export default i18next;