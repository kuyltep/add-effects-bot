/**
 * Wrapper for franc language detection to handle ESM module import
 */

// Cache for the imported module to avoid reimporting
let francModule: any = null;

/**
 * Detect language of text using franc
 * @param text Text to analyze
 * @returns ISO 639-3 language code
 */
export async function detectLanguageWithFranc(text: string): Promise<string> {
  try {
    if (!francModule) {
      francModule = await import('franc');
    }

    return francModule.franc(text);
  } catch (error) {
    // Log error and return English as fallback
    console.error('Error importing franc:', error);
    return 'eng';
  }
}
