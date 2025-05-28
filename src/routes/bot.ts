import { FastifyInstance } from 'fastify';
import { bot } from '../bot/core';

export default async function botRoutes(fastify: FastifyInstance) {
  fastify.post('/webhook', async (request, reply) => {
    try {
      await bot.handleUpdate(request.body as any);
      reply.code(200).send('OK');
    } catch (error) {
      console.error('Error processing webhook update:', error);
      reply.code(500).send('Internal Server Error');
    }
  });

  fastify.get('/health', async (request, reply) => {
    try {
      const botInfo = await bot.telegram.getMe();
      reply.code(200).send({
        status: 'healthy',
        bot: {
          id: botInfo.id,
          username: botInfo.username,
          first_name: botInfo.first_name,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Bot health check failed:', error);
      reply.code(503).send({
        status: 'unhealthy',
        error: 'Bot connection failed',
        timestamp: new Date().toISOString(),
      });
    }
  });
}
