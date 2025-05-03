# Reve Telegram Bot Documentation

## Overview

The Reve Telegram Bot is a service for generating AI images using the Reve SDK with both a Telegram bot interface and a REST API. Users can interact with the bot to generate images, manage their accounts, and utilize various features like referrals and subscriptions.

## Project Structure

```
app/
├── prisma/                # Database schema and migrations
│   └── schema.prisma
├── src/
│   ├── bot/               # Telegram bot implementation
│   │   ├── scenes/        # Bot conversation scenes (start, generate, video, upgrade, settings, balance, referral, payment, subscription, help, links)
│   │   ├── middleware/    # Bot middleware functions
│   │   ├── types.ts       # Bot TypeScript types
│   │   ├── core.ts        # Bot core functionality (instance, middleware, scenes registration)
│   │   ├── handlers.ts    # Bot command and message handlers
│   │   └── index.ts       # Bot entry point
│   ├── locales/           # Localization files (en, ru)
│   ├── queues/            # BullMQ queue implementation (generation, video, upgrade)
│   │   ├── generationQueue.ts
│   │   ├── generationWorker.ts
│   │   ├── videoQueue.ts
│   │   ├── videoWorker.ts
│   │   ├── upgradeQueue.ts
│   │   └── upgradeWorker.ts
│   ├── routes/            # API routes (admin, auth, bot, generation, health, payments, referrals)
│   ├── services/          # Business logic services (auth, cleanup, expired-subscription, generation, language, payment, referral, replicate, restoration, reve-account, scene, settings, user)
│   ├── middleware/        # Fastify middleware (e.g., authentication)
│   ├── types/             # Global TypeScript type definitions
│   ├── utils/             # Utility functions and wrappers
│   ├── config.ts          # Application configuration loader
│   ├── i18n.ts            # i18n configuration
│   └── index.ts           # Main application entry point (Fastify server setup)
├── uploads/               # Generated images and videos storage
├── client/                # Admin panel frontend
│   └── admin/             # Vue 3 admin interface
├── .env.example           # Example environment variables
├── package.json
├── tsconfig.json
└── README.md
```

## Tech Stack

- **Node.js** - JavaScript runtime
- **TypeScript** - Static typing for JavaScript
- **Fastify** - Web framework for the API
- **Telegraf** - Framework for Telegram bot development
- **Prisma** - ORM for database operations
- **PostgreSQL** - Primary database
- **i18n** - Internationalization support
- **Reve SDK** - AI image generation SDK
- **BullMQ/Redis** - Job queuing system
- **Replicate API** - AI image enhancement service
- **Vue 3** - Frontend framework for admin panel
- **Tailwind CSS** - Utility-first CSS framework for styling

## Key Features

1. **User Authentication**
   - JWT-based authentication for API
   - Telegram-based authentication for bot
   - Password-based authentication for admin panel

2. **AI Media Generation & Enhancement**
   - **Image Generation**: Prompt-based AI image generation via Reve AI.
   - **Video Animation**: Generate animated videos from images with effects (`animation`, `hug`) via Reve AI.
   - **Image Enhancement**: AI-powered image quality upgrade via Replicate.
   - Style and parameter customization.
   - Multi-lingual prompt support with auto-translation (OpenAI).

3. **Subscription and Payment System**
   - Tiered subscription plans
   - Credits-based usage
   - Robokassa integration for payments
   - Automatic cleanup of stale pending payments.

4. **Referral System**
   - User invitation links
   - Credit bonuses for referrals
   - Multi-level referral tracking

5. **Multilingual Support**
   - English and Russian interfaces
   - Automatic prompt translation using OpenAI.

6. **Admin Panel**
   - User management (view, edit)
   - Generation statistics and history
   - Payment tracking
   - Reve AI account management (add, update, delete, monitor)
   - System maintenance tasks (cleanup)

7. **High Availability & Performance**
   - **Reve AI Account Rotation**: Automatic load balancing and error recovery across multiple Reve AI accounts.
   - **Background Job Processing**: Asynchronous handling of generation, video, and enhancement tasks using BullMQ.

8. **Configuration Management**
   - Centralized payment package configuration via `.env`.

## TypeScript Configuration

The project uses TypeScript with a custom configuration to balance type safety and development speed.

Example `tsconfig.json` configuration:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": false,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

For development speed, we use a TypeScript-transpile-only build process:

```typescript
// Example build script
import { exec } from 'child_process';
import fs from 'fs/promises';

// Run TypeScript transpile-only (no type checking)
exec('npx typescript-transpile-only', async (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }
  
  // Copy locale files to dist
  await fs.cp('./src/locales', './dist/locales', { recursive: true });
  
  console.log('Build completed successfully');
});
```

## ESM Module Compatibility

Some modern packages like `nanoid` and `franc` are ESM-only modules. To use them in a CommonJS environment, we implement wrapper utilities:

```typescript
// src/utils/id-generator.ts
export async function generateId(size = 10) {
  const { nanoid } = await import('nanoid');
  return nanoid(size);
}

// src/utils/language-detector.ts
export async function detectLanguage(text: string) {
  const { franc } = await import('franc');
  return franc(text);
}
```

These wrapper utilities are then used throughout the application:

```typescript
import { generateId } from '../utils/id-generator';

async function createUser() {
  const userId = await generateId(16);
  // ... rest of user creation logic
}
```

## Reve SDK Integration

The Reve SDK is integrated through a dedicated service:

```typescript
// src/services/reve-service.ts
import axios from 'axios';
import { env } from '../utils/env';

export class ReveService {
  private baseUrl = 'https://preview.reve.art/api';
  private headers = {
    'Authorization': env.REVE_AUTH,
    'Cookie': env.REVE_COOKIE
  };

  async generateImage(prompt: string, options = {}) {
    const response = await axios.post(`${this.baseUrl}/generations`, {
      prompt,
      projectId: env.REVE_PROJECT_ID,
      ...options
    }, { headers: this.headers });

    return response.data;
  }

  async getGenerationStatus(generationId: string) {
    const response = await axios.get(`${this.baseUrl}/generations/${generationId}`, 
      { headers: this.headers });
      
    return response.data;
  }
}
```

## Referral System

The referral system is implemented with the following components:

1. **Referral links** - Generated with a unique code for each user
2. **Referral tracking** - Database tables for tracking referrer-referee relationships
3. **Credit rewards** - Automatic crediting when referrals make payments

```typescript
// Example referral link generation
async function generateReferralLink(userId: string) {
  const { generateId } = await import('../utils/id-generator');
  const code = await generateId(8);
  
  await prisma.referralCode.create({
    data: {
      code,
      userId
    }
  });
  
  return `https://t.me/YourBotName?start=p_${code}`;
}
```

## Telegram Bot Architecture

The bot is structured around Telegraf's scenes framework:

1. **Core Components**:
   - `bot/core.ts` - Bot instance setup, middleware registration (session, i18n, user context), scene registration.
   - `bot/handlers.ts` - Command handlers (`/start`, `/generate`, etc.), message handlers (text, photo), callback query handlers.
   - `bot/index.ts` - Main bot initialization and webhook/polling setup.

2. **Scenes (`src/bot/scenes/`)**: Manage multi-step conversations.
   - `start.ts` - Initial interaction and main menu.
   - `generate.ts` - Image generation workflow.
   - `video.ts` - Video generation workflow (image selection, effect choice).
   - `upgrade.ts` - Image enhancement workflow.
   - `settings.ts` - User settings management (language, etc.).
   - `balance.ts` - Display user balance.
   - `referral.ts` - Display referral information and link.
   - `payment.ts` - Initiate payment process.
   - `subscription.ts` - Manage user subscription.
   - `help.ts` - Display help information.
   - `links.ts` - Display useful links.

3. **Middleware (`src/bot/middleware/`)**: Functions applied to incoming updates.
   - User authentication and context loading.
   - Session management.
   - Language setting persistence.
   - Rate limiting (if implemented).

Example scene implementation:

```typescript
// src/bot/scenes/generate.ts
import { Scenes } from 'telegraf';
import { MyContext } from '../types';

export const generateScene = new Scenes.WizardScene<MyContext>(
  'generate',
  (ctx) => {
    ctx.reply('Please send the prompt for image generation:');
    return ctx.wizard.next();
  },
  async (ctx) => {
    if (!ctx.message || !('text' in ctx.message)) {
      ctx.reply('Please send a text prompt.');
      return;
    }
    
    const prompt = ctx.message.text;
    
    // Store prompt in session
    ctx.session.generateData = { prompt };
    
    // Ask for confirmation
    ctx.reply(`Your prompt: ${prompt}\nConfirm? (Yes/No)`);
    return ctx.wizard.next();
  },
  async (ctx) => {
    // Process confirmation and generate image
    // ...
    return ctx.scene.leave();
  }
);
```

## Admin Panel

The admin panel is built with Vue 3 and provides an interface to manage users, view statistics, and track payments.

### Authentication

Authentication for the admin panel uses a simple password-based mechanism handled within the main admin route (`src/routes/admin.ts`). The password is stored in the `.env` file as `ADMIN_PASSWORD`.

```typescript
// Simplified example from src/routes/admin.ts
fastify.post('/api/admin/login', async (request, reply) => {
  // ... password check logic ...
  if (password === env.ADMIN_PASSWORD) {
    const token = fastify.jwt.sign({ role: 'admin', /* ... */ });
    return { token };
  }
  // ... error handling ...
});
```

### Admin Panel Components

The admin panel consists of the following main components:

1. **Login** - Simple login form that checks the password against the environment variable
2. **Dashboard** - Displays key statistics and metrics
3. **Users** - List of users with details and management actions
4. **User Edit** - Form to edit user information and settings
5. **Payments** - List of payment transactions

### Admin API Endpoints

The admin API (`src/routes/admin.ts`) includes endpoints for managing the application:

- `POST /api/admin/login` - Authenticate admin user.
- `GET /api/admin/users` - List all users.
- `GET /api/admin/users/:id` - Get specific user details.
- `PUT /api/admin/users/:id` - Update user information.
- `GET /api/admin/stats` - Get system statistics (user counts, generation counts, etc.).
- `GET /api/admin/payments` - List all payments.
- `GET /api/admin/generations` - List all generations.
- **Reve Account Management:**
  - `GET /api/admin/reve-accounts` - List all Reve AI accounts.
  - `POST /api/admin/reve-accounts` - Add a new Reve AI account.
  - `PUT /api/admin/reve-accounts/:id` - Update an account.
  - `DELETE /api/admin/reve-accounts/:id` - Delete an account.
  - `POST /api/admin/reve-accounts/:id/reset-error` - Manually reset error status for an account.
- **Maintenance:**
  - `POST /api/admin/maintenance/cleanup` - Run all cleanup tasks (files, subscriptions, payments).
  - `POST /api/admin/maintenance/cleanup-payments` - Run only payment cleanup.
  - `POST /api/admin/maintenance/cleanup-files` - Run only file cleanup.
  - `POST /api/admin/maintenance/cleanup-subscriptions` - Run only expired subscription cleanup.

## API Endpoints

The API is built with Fastify and includes the following endpoints:

### Health Check

- `GET /api/health` - Check application health status.

### Authentication (`src/routes/auth.ts`)

- `POST /api/auth/login` - User login (potentially for future web client).
- `POST /api/auth/refresh` - Refresh access token.

### Image Generation (`src/routes/generation.ts`)

- `POST /api/generations` - Create a new image generation request (likely internal or for future API users).
- `GET /api/generations/:id` - Get generation details.
- `GET /api/generations` - List user's generations.

### Referrals (`src/routes/referrals.ts`)

- `GET /api/referrals` - Get user's referral statistics.
- `POST /api/referrals/code` - Generate a new referral code.

### Payments (`src/routes/payments.ts`)

- `POST /api/payments/create` - Create a payment intent (Robokassa).
- `GET /api/payments/history` - Get payment history.
- `POST /api/payments/robokassa/callback` - Robokassa payment result webhook.

### Bot (`src/routes/bot.ts`)

- `POST /api/bot/webhook` - Telegram webhook endpoint.
- `POST /api/bot/setWebhook` - Set webhook URL via API call.
- `POST /api/bot/setCommands` - Update bot commands via API call.

## Localization

The project uses i18next for localization, supporting:

- English (default)
- Russian

Localization files are structured as:

```
src/locales/
├── en/
│   ├── common.json
│   ├── bot.json
│   └── errors.json
└── ru/
    ├── common.json
    ├── bot.json
    └── errors.json
```

## Database Schema

The main entities in the database include:

1. **User** - User account information, balance, language preference.
2. **Generation** - Image, video, and enhancement generation records (prompt, status, costs, file paths).
3. **ReveAccount** - Stores credentials and status for multiple Reve AI accounts.
4. **Referral** - Referral relationships and codes.
5. **Payment** - Payment records (status, amount, provider details).
6. **Subscription** - Subscription details (plan, expiration).
7. **UserSettings** - User preferences (potentially merged into User).

## Environment Variables

Required environment variables (refer to `.env.example` for the full list):

```
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Redis (for queues & caching)
REDIS_URL=redis://host:port

# Telegram
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
# TELEGRAM_WEBHOOK_URL=https://your-domain.com/api/bot/webhook # Set via API or manually

# OpenAI API (for translation)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-3.5-turbo # Or another model

# Reve API (Primary/Fallback - add more via Admin Panel or .env for rotation)
# Example for one account:
REVE_AUTH_ACCOUNT_1=Bearer your_auth_token_1
REVE_COOKIE_ACCOUNT_1=your_cookie_value_1
REVE_PROJECT_ID_ACCOUNT_1=your_project_id_1
# Add REVE_AUTH_ACCOUNT_2, REVE_COOKIE_ACCOUNT_2, etc. for more accounts

# Replicate API (for enhancement)
REPLICATE_API_TOKEN=your_replicate_token

# Robokassa
ROBOKASSA_MERCHANT_LOGIN=your_merchant_login
ROBOKASSA_PASSWORD1=your_password1
ROBOKASSA_PASSWORD2=your_password2
ROBOKASSA_IS_TEST=true # or false

# Application
PORT=3000
HOST=0.0.0.0 # Recommended for containers
NODE_ENV=development # or production
APP_URL=https://your-domain.com # Used for webhook setup, payment URLs
UPLOAD_DIR=uploads
JWT_SECRET=a_very_strong_secret_key
JWT_EXPIRES_IN=7d
ADMIN_PASSWORD=your_secure_admin_password

# Payment Packages (Example)
# Define packages like: PACKAGE_{COUNT}_NAME, PACKAGE_{COUNT}_PRICE, PACKAGE_{COUNT}_COUNT
PACKAGE_100_NAME="Standard Pack"
PACKAGE_100_PRICE=500
PACKAGE_100_COUNT=100
PACKAGE_500_NAME="Large Pack"
PACKAGE_500_PRICE=2000
PACKAGE_500_COUNT=500

# Other settings
DEFAULT_LANGUAGE=en
MAX_RETRIES=3 # Max generation retries on different accounts
ACCOUNT_COOLDOWN_MINUTES=60
CLEANUP_PENDING_PAYMENTS_HOURS=1
```

## Getting Started

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

## Build Process

For development (with nodemon for auto-restarts):
```bash
yarn dev
```

For production:
```bash
yarn build # Transpiles TS, potentially builds frontend
yarn start # Runs the compiled JS from ./dist
```

## Deployment

### Deploying to Railway.app

Railway.app is the recommended deployment platform for this project, offering a straightforward way to deploy Node.js applications with integrated PostgreSQL and Redis services.

#### Prerequisites

1. A Railway.app account
2. Your project code in a GitHub repository
3. All necessary environment variables prepared

#### Deployment Steps

1. Create a `railway.json` configuration file in your project root:

```json
{
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "yarn install --production=false && yarn build" // Ensure devDeps are available for build
  },
  "deploy": {
    "startCommand": "yarn start",
    "healthcheckPath": "/api/health", // Ensure this route exists
    "healthcheckTimeout": 120 // Increased timeout might be needed
  }
}
```

2. Add or update the following scripts in your `package.json`:

```json
"scripts": {
  "build": "tsc", // Simplified build, admin panel build might need separate step or be part of frontend deployment
  "start": "node dist/index.js",
  "dev": "nodemon", // Assumes nodemon.json is configured
  "prisma:generate": "prisma generate",
  "prisma:migrate": "prisma migrate deploy",
  "lint": "eslint .",
  "format": "prettier --write ."
}
```

*Note: Adjust `build` script based on actual frontend build requirements.*

3. Add a health check endpoint (`src/routes/health.ts`):

```typescript
// src/routes/health.ts
import { FastifyInstance } from 'fastify';

export default async function(fastify: FastifyInstance) {
  fastify.get('/api/health', async () => {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  });
}
```

4. Log in to Railway.app and create a new project

5. Link your GitHub repository to the Railway project

6. Add PostgreSQL and Redis services from the Railway.app add-ons

7. Configure environment variables:
   - `DATABASE_URL` and `REDIS_URL` will be automatically provided by Railway
   - Add all other required environment variables through the Railway dashboard

8. Deploy your application by pushing to your GitHub repository

9. Set up a custom domain for your application in the Railway dashboard (optional).

10. Configure the Telegram webhook. You can do this via the API endpoint (if configured and authenticated) or manually:
    * **Manual Setup:**
        ```bash
        curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
          -H "Content-Type: application/json" \
          -d "{\"url\": \"https://your-railway-app-url.up.railway.app/api/bot/webhook\"}"
        ```
    * **API Setup:** Ensure `APP_URL` is set correctly in your environment variables and call `POST /api/bot/setWebhook`.

### Alternative Deployment Options

Other deployment options include:

- **Render.com** - Similar to Railway, with flexible configuration options
- **DigitalOcean App Platform** - Simple PaaS with good scalability
- **Heroku** - Traditional PaaS for Node.js applications
- **VPS** (DigitalOcean, Linode, Vultr) - For complete control, requires manual setup

## Telegram Bot Webhook

Ensure the webhook is set correctly for Telegram to send updates to your running application.

**Set Webhook:**
```bash
# Replace YOUR_BOT_TOKEN and YOUR_WEBHOOK_URL
curl -F "url=YOUR_WEBHOOK_URL" https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook
```
*Example URL: `https://your-app-name.up.railway.app/api/bot/webhook`*

**Get Webhook Info:**
```bash
curl https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo
```

**Delete Webhook (for switching to polling):**
```bash
curl https://api.telegram.org/botYOUR_BOT_TOKEN/deleteWebhook
```

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [Fastify](https://www.fastify.io/)
- [Telegraf](https://telegraf.js.org/)
- [Prisma](https://www.prisma.io/)
- [BullMQ](https://docs.bullmq.io/)
- [i18next](https://www.i18next.com/)
- [OpenAI](https://openai.com/)
- [Replicate](https://replicate.com/)
