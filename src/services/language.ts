import OpenAI from 'openai';
import { detectLanguageWithFranc } from '../utils/franc-wrapper';
import config from '../config';
import { Logger } from '../utils/rollbar.logger';

// Initialize OpenAI API client
const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

/**
 * Detect the language of a text string
 * @param text The text to analyze
 * @returns ISO 639-3 language code or null if detection failed
 */
export async function detectLanguage(text: string): Promise<string | null> {
  try {
    // Only detect if the text is long enough
    if (text.length < 10) {
      return null;
    }

    const langCode = await detectLanguageWithFranc(text);

    // franc returns 'und' for undetermined
    if (langCode === 'und') {
      return null;
    }

    return langCode;
  } catch (error) {
    Logger.error(error, { context: 'language-service', method: 'detectLanguage' });
    return null;
  }
}

/**
 * Translate a text string to English using OpenAI
 * @param text The text to translate
 * @returns Translated text
 */
export async function translatePrompt(text: string): Promise<string> {
  try {
    // Skip translation for very short text
    if (text.length < 5) {
      return text;
    }

    const completion = await openai.chat.completions.create({
      model: config.openai.defaultModel,
      messages: [
        {
          role: 'system',
          content:
            'You are a translator. Translate the given text to English accurately, preserving meaning, tone, and style. Return only the translated text, with no explanations or additional context.',
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: config.openai.translationTemperature,
      max_tokens: 1000, // Limit token usage
    });

    const translation = completion.choices[0]?.message?.content?.trim();

    if (!translation) {
      throw new Error('Empty translation response');
    }

    return translation;
  } catch (error) {
    Logger.error(error, { 
      context: 'language-service', 
      method: 'translatePrompt',
      textLength: text.length
    });
    throw new Error(
      `Translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Translate text to English using OpenAI
 * @param text Text to translate
 * @param sourceLanguage Source language code (optional)
 * @returns Translated text
 */
export async function translateToEnglish(text: string, sourceLanguage?: string): Promise<string> {
  try {
    // No need to translate if text is too short or already in English
    if (text.length < 3) {
      return text;
    }

    // Detect language if not provided
    const detectedLanguage = sourceLanguage || (await detectLanguage(text));

    // If already English or language detection failed, return as is
    if (detectedLanguage === 'eng' || detectedLanguage === 'und') {
      return text;
    }

    // Use OpenAI for translation
    const response = await openai.chat.completions.create({
      model: config.openai.defaultModel,
      messages: [
        {
          role: 'system',
          content:
            'You are a professional translator. Translate the text to English without adding any explanations or additional text.',
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: config.openai.translationTemperature,
      max_tokens: 500,
    });

    // Return the translated text
    return response.choices[0].message.content?.trim() || text;
  } catch (error) {
    Logger.error(error, { 
      context: 'language-service', 
      method: 'translateToEnglish',
      sourceLanguage
    });
    // Return original text in case of error
    return text;
  }
}

/**
 * Process a prompt for image generation
 * - Detect language
 * - Translate to English if needed
 * @param prompt Prompt to process
 * @returns Processed prompt with original and translated versions
 */
export async function processPrompt(prompt: string): Promise<{
  originalPrompt: string;
  translatedPrompt: string;
  isTranslated: boolean;
}> {
  const originalPrompt = prompt.trim();
  const language = await detectLanguage(originalPrompt);

  // Only translate if not English
  if (language !== 'eng' && language !== 'und') {
    const translatedPrompt = await translateToEnglish(originalPrompt, language || undefined);
    return {
      originalPrompt,
      translatedPrompt,
      isTranslated: translatedPrompt !== originalPrompt,
    };
  }

  // Return original if already English
  return {
    originalPrompt,
    translatedPrompt: originalPrompt,
    isTranslated: false,
  };
}
