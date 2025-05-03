import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import crypto from 'crypto';
import { prisma } from '../utils/prisma';
import { processRobokassaPayment } from '../services/payment';

export default async function (fastify: FastifyInstance, options: FastifyPluginOptions) {
  // Get payment plans
  fastify.get('/plans', async (request, reply) => {
    try {
      // Define the available subscription plans
      const plans = [
        {
          id: 'monthly',
          name: 'Monthly Subscription',
          description: 'Unlimited generations for 30 days',
          price: 9.99,
          currency: 'USD',
          type: 'subscription',
          days: 30,
        },
        {
          id: 'yearly',
          name: 'Yearly Subscription',
          description: 'Unlimited generations for 365 days',
          price: 99.99,
          currency: 'USD',
          type: 'subscription',
          days: 365,
        },
        {
          id: 'pack10',
          name: '10 Generations Pack',
          description: '10 image generations',
          price: 4.99,
          currency: 'USD',
          type: 'pack',
          count: 10,
        },
        {
          id: 'pack50',
          name: '50 Generations Pack',
          description: '50 image generations',
          price: 19.99,
          currency: 'USD',
          type: 'pack',
          count: 50,
        },
      ];

      return reply.send({ plans });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to get payment plans' });
    }
  });

  // Create a payment for Robokassa
  fastify.post(
    '/create',
    {
      preHandler: (fastify as any).authenticate,
    },
    async (request, reply) => {
      try {
        const userId = (request.user as { id: string }).id;
        const { planId } = request.body as { planId: string };

        // Get the plan details (in a real implementation, this would be from a database)
        const plans = {
          monthly: {
            name: 'Monthly Subscription',
            price: 9.99,
            type: 'subscription',
            days: 30,
          },
          yearly: {
            name: 'Yearly Subscription',
            price: 99.99,
            type: 'subscription',
            days: 365,
          },
          pack10: {
            name: '10 Generations Pack',
            price: 4.99,
            type: 'pack',
            count: 10,
          },
          pack50: {
            name: '50 Generations Pack',
            price: 19.99,
            type: 'pack',
            count: 50,
          },
        };

        const plan = plans[planId as keyof typeof plans];
        if (!plan) {
          return reply.status(400).send({ error: 'Invalid plan ID' });
        }

        // Create a payment record
        const payment = await prisma.payment.create({
          data: {
            userId,
            amount: plan.price,
            status: 'pending',
            subscriptionType: plan.type === 'subscription' ? planId : null,
            subscriptionDays: plan.type === 'subscription' ? (plan as any).days : null,
            generationsAdded: plan.type === 'pack' ? (plan as any).count : null,
          },
        });

        // Generate Robokassa payment URL
        // In a real implementation, you would use Robokassa's API
        const robokassaLogin = process.env.ROBOKASSA_LOGIN;
        const robokassaPassword1 = process.env.ROBOKASSA_PASSWORD1;
        const isTest = process.env.ROBOKASSA_TEST_MODE === 'true';

        const amount = payment.amount.toFixed(2);
        const description = `Payment for ${plan.name}`;
        const signature = crypto
          .createHash('md5')
          .update(`${robokassaLogin}:${amount}:${payment.id}:${robokassaPassword1}`)
          .digest('hex');

        const robokassaUrl = 
         'https://auth.robokassa.ru/Merchant/Index.aspx';

        const paymentUrl = `${robokassaUrl}?MerchantLogin=${robokassaLogin}&OutSum=${amount}&InvId=${payment.id}&Description=${encodeURIComponent(description)}&SignatureValue=${signature}&IsTest=${isTest ? 1 : 0}`;

        return reply.send({
          payment: {
            id: payment.id,
            amount: payment.amount,
            status: payment.status,
          },
          paymentUrl,
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to create payment' });
      }
    }
  );

  // Robokassa callback for payment notifications
  fastify.post('/robokassa/callback', async (request, reply) => {
    try {


      const { OutSum, InvId, SignatureValue } = request.body as {
        OutSum: string;
        InvId: string;
        SignatureValue: string;
      };

      

      // Process payment using our payment service
      const success = await processRobokassaPayment(OutSum, InvId, SignatureValue);

      if (!success) {
        return reply.status(400).send('Invalid payment data');
      }

      return reply.send('OK');
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send('Error processing payment');
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
