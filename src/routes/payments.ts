import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../utils/prisma';
import { addGenerationsToUser } from '../services/payment';
import { sendPaymentSuccessNotification } from '../services/payment';

export default async function (fastify: FastifyInstance, options: FastifyPluginOptions) {


  // Payment service webhook for payment notifications
  fastify.post('/webhook', async (request, reply) => {
    try {
      // Validate API key from the payment microservice
      const apiKey = request.headers['x-api-key'] as string;
      if (!apiKey || apiKey !== process.env.API_KEY) {
        request.log.warn('Invalid API key for payment webhook');
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const { paymentId, userId, status, amount, generationsAdded } = request.body as {
        paymentId: string;
        userId: string;
        status: string;
        amount: number;
        generationsAdded: number;
      };

      // Validate required parameters
      if (!paymentId || !userId || !status) {
        request.log.error('Missing required parameters in payment webhook');
        return reply.status(400).send({ error: 'Missing required parameters' });
      }

      request.log.info(`Received payment webhook for user ${userId}, status: ${status}`);

      // Only process completed payments
      if (status !== 'PAID') {
        return reply.send({ success: true, message: 'Payment status acknowledged' });
      }

      // Find the user in our database
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        request.log.error(`User not found: ${userId}`);
        return reply.status(400).send({ error: 'User not found' });
      }


      // Add generations to user's account
      if (generationsAdded) {
        await addGenerationsToUser(userId, generationsAdded);
        
        // Notify user via Telegram
        sendPaymentSuccessNotification({
          userId,
          telegramId: user.telegramId,
          generationsAdded,
          amount,
        })
      }

      return reply.send({ success: true });
    } catch (error) {
      request.log.error('Error processing payment webhook', error);
      return reply.status(500).send({ error: 'Error processing payment' });
    }
  });

  // Get payment history for the current user
  fastify.get(
    '/',
    {
      preHandler: (fastify as any).authenticate,
    },
    async (request, reply) => {
      try {
        const userId = (request.user as { id: string }).id;

        const payments = await prisma.payment.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });

        return reply.send({ payments });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get payment history' });
      }
    }
  );
}
