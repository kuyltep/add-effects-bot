import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { bot } from '../bot';
import { Buffer } from 'buffer';

export default async function (fastify: FastifyInstance, opts: FastifyPluginOptions) {
  fastify.post('/webhook', {
    config: {
      rawBody: true,
    },
    handler: async (request, reply) => {
      try {
        // Get the raw body from the request
        const body = request.body as Buffer;

        // Process update
        await bot.handleUpdate(JSON.parse(body.toString()));

        // Send OK response
        return { ok: true };
      } catch (error) {
        fastify.log.error('Error handling webhook:', error);
        return reply.status(500).send({ error: 'Failed to process webhook' });
      }
    },
  });

  // Route to set webhook URL
  fastify.post('/setWebhook', {
    handler: async (request, reply) => {
      try {
        const domain = process.env.WEBHOOK_DOMAIN;

        if (!domain) {
          return reply.status(400).send({ error: 'WEBHOOK_DOMAIN not configured' });
        }

        const webhookUrl = `${domain}/api/bot/webhook`;
        const result = await bot.telegram.setWebhook(webhookUrl);

        return {
          success: result,
          webhook_url: webhookUrl,
        };
      } catch (error) {
        fastify.log.error('Error setting webhook:', error);
        return reply.status(500).send({ error: 'Failed to set webhook' });
      }
    },
  });

  // Route to get webhook info
  fastify.get('/webhookInfo', {
    handler: async (request, reply) => {
      try {
        const info = await bot.telegram.getWebhookInfo();
        return info;
      } catch (error) {
        fastify.log.error('Error getting webhook info:', error);
        return reply.status(500).send({ error: 'Failed to get webhook info' });
      }
    },
  });
}
