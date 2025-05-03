import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../utils/prisma';

export default async function (fastify: FastifyInstance, options: FastifyPluginOptions) {
  // Get referrals for the current user
  fastify.get(
    '/',
    {
      preHandler: (fastify as any).authenticate,
    },
    async (request, reply) => {
      try {
        const userId = (request.user as { id: string }).id;

        // Get user's referrals
        const referrals = await prisma.referral.findMany({
          where: { referrerId: userId },
          include: {
            invitedUser: {
              select: {
                id: true,
                email: true,
                createdAt: true,
              },
            },
          },
        });

        return reply.send({
          referrals,
          totalCount: referrals.length,
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get referrals' });
      }
    }
  );

  // Get referral stats for the current user
  fastify.get(
    '/stats',
    {
      preHandler: (fastify as any).authenticate,
    },
    async (request, reply) => {
      try {
        const userId = (request.user as { id: string }).id;

        // Get count of user's referrals
        const referralCount = await prisma.referral.count({
          where: { referrerId: userId },
        });

        // Get user with referral code
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            referralCode: true,
            remainingGenerations: true,
          },
        });

        return reply.send({
          referralCount,
          referralCode: user?.referralCode,
          referralLink: `${process.env.APP_URL}/ref/${user?.referralCode}`,
          remainingGenerations: user?.remainingGenerations,
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get referral stats' });
      }
    }
  );

  // Validate a referral code
  fastify.get('/validate/:code', async (request, reply) => {
    try {
      const { code } = request.params as { code: string };

      // Find user with this referral code
      const user = await prisma.user.findUnique({
        where: { referralCode: code },
        select: {
          id: true,
          email: true,
        },
      });

      if (!user) {
        return reply.status(404).send({ valid: false, error: 'Invalid referral code' });
      }

      return reply.send({ valid: true });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Failed to validate referral code' });
    }
  });
}
