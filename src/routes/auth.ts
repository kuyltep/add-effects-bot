import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { createUser, findUserByEmail } from '../services/user';
import bcrypt from 'bcrypt';
import { prisma } from '../utils/prisma';

export default async function (fastify: FastifyInstance, options: FastifyPluginOptions) {
  // Register endpoint
  fastify.post('/register', async (request, reply) => {
    try {
      const { email, password, referralCode } = request.body as {
        email: string;
        password: string;
        referralCode?: string;
      };

      // Check if email already exists
      const existingUser = await findUserByEmail(email);
      if (existingUser) {
        return reply.status(400).send({ error: 'Email already registered' });
      }

      // Create user
      const user = await createUser(email, password, undefined, undefined, undefined, referralCode);

      // Generate token
      const token = fastify.jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
      );

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          remainingGenerations: user.remainingGenerations,
          subscriptionActive: user.subscriptionActive,
          referralCode: user.referralCode,
          role: user.role,
        },
        token,
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Registration failed' });
    }
  });

  // Login endpoint
  fastify.post('/login', async (request, reply) => {
    try {
      const { email, password } = request.body as {
        email: string;
        password: string;
      };

      // Find user by email
      const user = await findUserByEmail(email);
      if (!user) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      // Check password
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        return reply.status(401).send({ error: 'Invalid email or password' });
      }

      // Generate token
      const token = fastify.jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
      );

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          remainingGenerations: user.remainingGenerations,
          subscriptionActive: user.subscriptionActive,
          referralCode: user.referralCode,
          role: user.role,
        },
        token,
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Login failed' });
    }
  });

  // Get current user
  fastify.get(
    '/me',
    {
      preHandler: (fastify as any).authenticate,
    },
    async (request, reply) => {
      try {
        const userId = (request.user as { id: string }).id;

        // Find user by id
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          return reply.status(404).send({ error: 'User not found' });
        }

        return reply.send({
          user: {
            id: user.id,
            email: user.email,
            remainingGenerations: user.remainingGenerations,
            subscriptionActive: user.subscriptionActive,
            referralCode: user.referralCode,
            role: user.role,
          },
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get user information' });
      }
    }
  );
}
