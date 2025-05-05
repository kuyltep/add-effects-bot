# Avato AI Effects Telegram Bot

A Telegram bot service for applying artistic effects to images, generating videos from images, and enhancing photos using various AI providers.

## Features Overview

- 🤖 Telegram bot for image effects, video animation, and image enhancement
- 🖼️ Multiple AI-powered image style effects:
  - Pixar style (via OpenAI)
  - Ghibli anime style (via OpenAI)
  - Claymation cartoon style (via OpenAI)
  - Plush toy effect (via FAL AI)
  - Ghibli animation style (via FAL AI)
  - 3D cartoon effect (via FAL AI)
- 🎬 Video animation from still images with customizable prompts
- ✨ AI-powered image upscaling/enhancement 
- 🔄 Automatic translation of non-English prompts (using OpenAI)
- 👥 Referral system with reward generations
- 💳 Payment processing system for generation credits
- 📱 User settings (resolution, language)
- 🌐 Multilingual support (English and Russian)
- 🔄 Background job processing with Redis-based queuing
- 💾 Consistent file management for generated media
- 🧹 Automatic cleanup of old files

## Prerequisites

* Node.js (v18+)
* PostgreSQL
* Redis
* API credentials for:
  * Telegram Bot Token
  * OpenAI API
  * FAL AI
  * Payment processor

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/avato-effects-bot.git
   cd avato-effects-bot
   ```

2. Install dependencies:
   ```bash
   yarn install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env file with your configuration
   ```

4. Set up the database:
   ```bash
   yarn prisma:migrate
   ```

5. Start the development server:
   ```bash
   yarn dev
   ```

## Environment Variables

Key environment variables must be configured for the application to run. 

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` with your specific credentials and settings.

**Required environment variables:**

- `TELEGRAM_BOT_TOKEN` - Token for your Telegram bot obtained from BotFather
- `POSTGRES_URL` - PostgreSQL connection URL
- `REDIS_URL` - Redis connection URL
- `OPENAI_API_KEY` - OpenAI API key
- `FAL_API_KEY` - FAL AI API key
- `OPENAI_MODEL` - OpenAI model name for image processing
- `VIDEO_GENERATION_COST` - Cost in credits for video generation
- `DEFAULT_LANGUAGE` - Default language (en or ru)

## Project Structure Overview

```
project/
├── prisma/         # Database schema and migrations
├── src/            # Source code
│   ├── bot/        # Telegram bot logic
│   │   ├── scenes/ # Telegram bot scenes for different interactions
│   │   ├── keyboards/ # Keyboard layouts
│   │   ├── middleware/ # Bot middlewares
│   │   └── handlers.ts # Command handlers
│   ├── services/   # Core business logic
│   │   ├── openai.ts     # OpenAI image effects
│   │   ├── fal-ai.ts     # FAL AI image effects
│   │   ├── language.ts   # Translation services
│   │   ├── sharp-service.ts # Image processing utilities
│   │   └── ...           # Other services
│   ├── queues/     # Background job processing
│   ├── utils/      # Utility functions and helpers
│   ├── types/      # TypeScript type definitions
│   ├── locales/    # Internationalization files
│   │   ├── en/     # English translations
│   │   └── ru/     # Russian translations
│   ├── routes/     # API endpoints (if any)
│   ├── middleware/ # Express middleware
│   └── config.ts   # Application configuration
├── uploads/        # Storage for generated media files
└── ...             # Configuration files
```

## Bot Functionality Overview

### Image Effects

The bot can apply various artistic effects to user-uploaded images:

1. **OpenAI-powered effects:**
   - Pixar 3D style
   - Ghibli anime style
   - Claymation cartoon style

2. **FAL AI-powered effects:**
   - Plush toy effect
   - Ghibli animation style
   - 3D cartoon effect

### Video Generation

The bot can create short animated videos from still images:
- User uploads a photo
- User can provide a custom prompt or use default prompt
- AI-generated video animates the subjects in the image

### Image Enhancement

The bot can enhance and upscale user images:
- Improves image quality
- Adds subtle effects (sharpening, grain, vignette)
- Applies post-processing for better results

## Key Components

### Image Processing Pipeline

All image processing uses a shared service (`sharp-service.ts`) for consistent handling across effects:
- Image format conversion (to PNG for AI processing)
- Resolution adjustment based on user preferences
- Post-processing with artistic enhancements

### Localization System

The bot supports multiple languages with a comprehensive localization system:
- Translation files in JSON format
- Dynamic language switching in user settings
- Automatic translation of user prompts to English for better AI results

### Main Keyboard Navigation

The bot implements a global middleware for handling main keyboard buttons:
- Seamless navigation between scenes
- Multi-language support for keyboard buttons
- Consistent user experience

## Development Commands

* `yarn dev`: Start the development server with auto-reload (using nodemon).
* `yarn build`: Build the project (transpile TypeScript).
* `yarn start`: Start the production server (requires `yarn build` first).
* `yarn prisma:generate`: Generate Prisma client.
* `yarn prisma:migrate`: Apply database migrations.
* `yarn format`: Format code using Prettier.
* `yarn lint`: Lint code using ESLint.

## License

MIT