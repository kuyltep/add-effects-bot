# Vue 3 + TypeScript + Vite

This template should help get you started developing with Vue 3 and TypeScript in Vite. The template uses Vue 3 `<script setup>` SFCs, check out the [script setup docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup) to learn more.

Learn more about the recommended Project Setup and IDE Support in the [Vue Docs TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup).

# Admin Panel

## Railway Deployment

This project is configured for deployment on Railway with Nginx.

### Prerequisites

- [Railway CLI](https://docs.railway.app/develop/cli)
- Docker installed locally (for testing)

### Deployment Steps

1. **Login to Railway**

```bash
railway login
```

2. **Link to your Railway project**

```bash
railway link
```

3. **Set environment variables**

```bash
railway variables set VITE_API_URL=https://your-api-url.com/api
```

4. **Deploy to Railway**

```bash
railway up
```

The application will be deployed using the Dockerfile and Nginx configuration.

### Local Testing

To test the Docker build locally:

```bash
docker build -t admin-panel .
docker run -p 8080:80 admin-panel
```

Then visit `http://localhost:8080/admin/`

## Development

```bash
# Install dependencies
yarn install

# Start development server
yarn dev

# Build for production
yarn build
```
