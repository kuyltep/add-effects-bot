import { bot, startBot, stopBot } from './core';
import { setupAllHandlers } from './handlers';

// Create scene manager

// Setup all the handlers from the handlers.ts file
setupAllHandlers();

// Export the startBot function and bot instance
export { startBot, stopBot, bot };
