import { FastifyInstance } from 'fastify';

/**
 * Эндпоинт для проверки здоровья сервиса
 * Используется Railway.app для мониторинга работоспособности
 */
export default async function (fastify: FastifyInstance) {
  fastify.get('/api/health', async () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      env: process.env.NODE_ENV || 'development',
    };
  });
}
