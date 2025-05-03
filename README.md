# Old new AI Telegram Bot & API

A service for generating AI images, videos, and enhancements using various AI providers, featuring a Telegram bot interface and a REST API.

## Features Overview

- 🤖 Telegram bot for image generation, video animation, and image enhancement
- 🖼️ AI-powered image generation via Reve AI
- 🎬 Video animation with multiple effect options (animation, hug) via Reve AI
- ✨ AI-powered image enhancement via Replicate
- 🔄 Automatic translation of prompts to English (using OpenAI)
- 👥 Referral system with rewards
- 💳 Payment processing with Robokassa
- 👨‍💼 Admin panel for user management
- 📊 Statistics and user analytics
- 🔒 JWT authentication for API access
- 🌐 Multilingual support (English and Russian)
- 📱 User settings and preferences
- 🔄 Background job processing with BullMQ
- 🌍 OpenAI-powered prompt translation
- 💾 Consistent local file storage for generated media
- 🧹 Automatic cleanup of stale pending payments
- ⚙️ Centralized payment package configuration via `.env`

## Prerequisites

*   Node.js (v18+)
*   PostgreSQL
*   Redis
*   Credentials for external services (Telegram Bot, Robokassa, OpenAI, Replicate). See `.env.example`.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/reve-tg.git
   cd reve-tg
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

1.  Copy the example file:
    ```bash
    cp .env.example .env
    ```
2.  Edit `.env` with your specific credentials and settings.

**Refer to `.env.example` and the **Environment Variables** section in [docs.md](./docs.md) for a complete list and descriptions.**

## Development Commands

*   `yarn dev`: Start the development server with auto-reload (using nodemon).
*   `yarn build`: Build the project (transpile TypeScript).
*   `yarn start`: Start the production server (requires `yarn build` first).
*   `yarn prisma:generate`: Generate Prisma client.
*   `yarn prisma:migrate`: Apply database migrations.
*   `yarn format`: Format code using Prettier.
*   `yarn lint`: Lint code using ESLint.

## API Documentation

**Detailed API documentation is available in [docs.md](./docs.md).**

## Telegram Bot Commands

A list of available bot commands can be found in the **Telegram Bot Commands** section of [docs.md](./docs.md).

## Project Structure Overview

```
app/
├── prisma/         # Database schema and migrations
├── src/            # Source code
│   ├── bot/        # Telegram bot logic (scenes, handlers)
│   ├── queues/     # Background job queues and workers
│   ├── routes/     # API endpoint definitions
│   ├── services/   # Business logic services
│   ├── ...         # Config, utils, types, etc.
├── uploads/        # Storage for generated media
├── client/         # Admin panel frontend (Vue 3)
├── .env.example    # Environment variable template
├── package.json
├── tsconfig.json
├── railway.json    # Deployment config for Railway
└── docs.md         # Detailed documentation
```

**See [docs.md](./docs.md) for a more detailed structure breakdown.**

## Development

```bash
# Install dependencies
yarn install

# Setup .env file (see Environment Variables)
cp .env.example .env
# ... edit .env ...

# Apply database migrations
yarn prisma:migrate

# Start in development mode
yarn dev
```

## Deployment

### Deploying to Railway.app

Railway.app is the recommended deployment platform for this project as it provides a simple way to deploy with PostgreSQL and Redis services.

#### Prerequisites for Railway.app deployment:

1. A Railway.app account
2. GitHub repository with your code
3. All environment variables ready

#### Steps to deploy:

1. Create a `railway.json` file in the project root:
   ```json
   {
     "build": {
       "builder": "NIXPACKS",
       "buildCommand": "yarn install --production=false && yarn build"
     },
     "deploy": {
       "startCommand": "yarn start",
       "healthcheckPath": "/api/health",
       "healthcheckTimeout": 120
     }
   }
   ```

2. Update your package.json scripts:
   ```json
   "scripts": {
     "build": "tsc",
     "start": "node dist/index.js",
     "dev": "nodemon",
     "prisma:generate": "prisma generate",
     "prisma:migrate": "prisma migrate deploy"
   }
   ```

3. Add a health check endpoint to your API (`/api/health`)

4. Log in to Railway.app and create a new project

5. Connect your GitHub repository

6. Add PostgreSQL and Redis services from the Railway.app add-ons

7. Set up all required environment variables

8. Deploy your application

9. Set up custom domain (optional) and configure Telegram webhook:
   ```bash
   curl -F "url=YOUR_WEBHOOK_URL" https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook
   ```

### Alternative Deployment Options

Other deployment options include:

- **Render.com** - Similar to Railway with flexible configuration options
- **DigitalOcean App Platform** - PaaS with good scalability options
- **Heroku** - Classic PaaS for Node.js applications
- **VPS** (DigitalOcean, Linode, Vultr) - For complete control, requires manual setup

## Known Issues and Limitations

Refer to the relevant section in [docs.md](./docs.md).

## Future Improvements

Refer to the relevant section in [docs.md](./docs.md).

## License

MIT

## Acknowledgements

Refer to the **Acknowledgements** section in [docs.md](./docs.md).