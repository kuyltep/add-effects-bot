import Rollbar from 'rollbar';

export function initializeRollbar() {
  const rollbarInstance = new Rollbar({
    accessToken: process.env.ROLLBAR_ACCESS_TOKEN,
    captureUncaught: true,
    captureUnhandledRejections: true,
    environment: process.env.NODE_ENV,
    enabled: true,
    reportLevel: 'error',
  });
  return rollbarInstance;
}

export class Logger {
  private static rollbarInstance = initializeRollbar();

  static error(error: Error | string, context?: Record<string, any>): void {
    console.error(
      '[ERROR]',
      error instanceof Error ? { message: error.message, stack: error.stack } : error,
      context || ''
    );

    // Log to Rollbar for production monitoring
    if (error instanceof Error) {
      this.rollbarInstance.error(error, context);
    } else {
      this.rollbarInstance.error(new Error(error), context);
    }
  }

  /**
   * Log a warning
   */
  static warn(message: string, context?: Record<string, any>): void {
    // Only log warnings to console if not in production
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[WARN]', message, context || '');
    }

    this.rollbarInstance.warn(message, context);
  }

  /**
   * Log an informational message
   */
  static info(message: string, context?: Record<string, any>): void {
    // Only log info to console if not in production or debug is enabled
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG) {
      console.log('[INFO]', message, context || '');
    }

    // Optionally log to Rollbar at info level
    this.rollbarInstance.info(message, context);
  }

  static critical(error: Error | string, context?: Record<string, any>): void {
    console.error(
      '[CRITICAL]',
      error instanceof Error ? { message: error.message, stack: error.stack } : error,
      context || ''
    );

    if (error instanceof Error) {
      this.rollbarInstance.critical(error, context);
    } else {
      this.rollbarInstance.critical(new Error(error), context);
    }
  }

  static withContext(baseContext: Record<string, any>) {
    return {
      error: (error: Error | string, additionalContext?: Record<string, any>) => {
        Logger.error(error, { ...baseContext, ...additionalContext });
      },
      warn: (message: string, additionalContext?: Record<string, any>) => {
        Logger.warn(message, { ...baseContext, ...additionalContext });
      },
      info: (message: string, additionalContext?: Record<string, any>) => {
        Logger.info(message, { ...baseContext, ...additionalContext });
      },
      critical: (error: Error | string, additionalContext?: Record<string, any>) => {
        Logger.critical(error, { ...baseContext, ...additionalContext });
      },
    };
  }
}
