import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { prisma } from '../utils/prisma';
import { runAllCleanupTasks, cleanupPayments } from '../services/cleanup';
import path from 'path';
import fs from 'fs/promises';


export default async function (fastify: FastifyInstance, options: FastifyPluginOptions) {

  /**
   * Эндпоинт для авторизации администратора по паролю из переменной окружения ADMIN_PASSWORD
   * @route POST /login
   * @param {Object} request.body - Данные авторизации
   * @param {string} request.body.password - Пароль администратора
   * @returns {Object} Объект с токеном авторизации
   */
  fastify.post('/login', async (request, reply) => {
    try {
      const { password } = request.body as { password: string };

      if (!password) {
        return reply.status(400).send({ error: 'Password is required' });
      }
      // Проверяем пароль администратора из переменных окружения
      if (password === process.env.ADMIN_PASSWORD) {
        // Создаем JWT токен с ролью админа
        const token = fastify.jwt.sign({
          role: 'admin',
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 часа
        });

        return { token, user: { role: 'ADMIN' } };
      }

      return reply.status(401).send({ error: 'Invalid admin password' });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Authentication failed' });
    }
  });

  // Dashboard statistics
  fastify.get(
    '/dashboard',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        // Get total counts
        const totalUsers = await prisma.user.count();
        const totalGenerations = await prisma.generation.count();
        const totalPayments = await prisma.payment.count();
        const activeSubscriptions = await prisma.user.count({
          where: { subscriptionActive: true }
        });

        // Get revenue
        const payments = await prisma.payment.findMany({
          where: { status: 'completed' },
          select: { amount: true },
        });

        const totalRevenue = payments.reduce(
          (sum: number, payment: { amount: number }) => sum + payment.amount,
          0
        );

        // Get counts for the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const newUsers = await prisma.user.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        });

        const newGenerations = await prisma.generation.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        });

        const newPayments = await prisma.payment.count({
          where: {
            createdAt: { gte: thirtyDaysAgo },
            status: 'completed',
          },
        });

        const recentPayments = await prisma.payment.findMany({
          where: {
            createdAt: { gte: thirtyDaysAgo },
            status: 'completed',
          },
          select: { amount: true },
        });

        const recentRevenue = recentPayments.reduce(
          (sum: number, payment: { amount: number }) => sum + payment.amount,
          0
        );

        // Return the dashboard stats in the format expected by the frontend
        return reply.send({
          totalUsers,
          activeSubscriptions,
          totalPayments,
          totalGenerations,
          totalRevenue,
          newUsers,
          newGenerations,
          newPayments,
          recentRevenue,
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get dashboard statistics' });
      }
    }
  );

  // // Add SSR routes for users, generations, etc.
  // fastify.get('/users', async (request, reply) => {
  //   const template = await getAdminTemplate();
  //   reply.type('text/html').send(template);
  // });

  // fastify.get('/generations', async (request, reply) => {
  //   const template = await getAdminTemplate();
  //   reply.type('text/html').send(template);
  // });

  // fastify.get('/payments', async (request, reply) => {
  //   const template = await getAdminTemplate();
  //   reply.type('text/html').send(template);
  // });

  // fastify.get('/settings', async (request, reply) => {
  //   const template = await getAdminTemplate();
  //   reply.type('text/html').send(template);
  // });

  // Get all users (admin only)
  fastify.get(
    '/users',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const {
          page = '1',
          limit = '50',
          search,
          sortBy = 'createdAt',
          sortDirection = 'desc'
        } = request.query as {
          page?: string;
          limit?: string;
          search?: string;
          sortBy?: string;
          sortDirection?: 'asc' | 'desc';
        };

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        // Build the where clause
        const where = search
          ? {
              OR: [
                { email: { contains: search } },
                { referralCode: { contains: search } },
                { telegramUsername: { contains: search } },
                { telegramId: { contains: search } },
              ],

            }
          : {};

        // Build the orderBy object
        const orderBy = {
          [sortBy]: sortDirection
        };

        const users = await prisma.user.findMany({
          where,
          orderBy,
          skip,
          take: limitNum,
          include: {
            _count: {
              select: {
                referrals: true,
                generations: {
                  where: {
                    status: 'COMPLETED'
                  }
                },
                payments: {
                  where: {
                    status: 'completed'
                  }
                },
              },
            },
            settings: true,
          },
        });

        const totalCount = await prisma.user.count({ where });

        // Format users with the stats that the frontend expects
        const formattedUsers = users.map((user) => ({
          id: user.id,
          email: user.email,
          telegramId: user.telegramId,
          telegramUsername: user.telegramUsername,
          telegramChatId: user.telegramChatId,
          remainingGenerations: user.remainingGenerations,
          subscriptionActive: user.subscriptionActive,
          subscriptionEndDate: user.subscriptionEndDate,
          referralCode: user.referralCode,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          role: user.role,
          isBanned: user.isBanned,
          banReason: user.banReason,
          bannedAt: user.bannedAt,
          generationCount: user._count.generations,
          paymentCount: user._count.payments,
          referralCount: user._count.referrals,
          settings: user.settings,
        }));

        return reply.send({
          users: formattedUsers,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalCount,
            totalPages: Math.ceil(totalCount / limitNum),
          },
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get users' });
      }
    }
  );

  // Get all generations (admin only)
  fastify.get(
    '/generations',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const {
          page = '1',
          limit = '20',
          search,
          sortBy = 'createdAt',
          sortDirection = 'desc',
        } = request.query as {
          page?: string;
          limit?: string;
          search?: string;
          sortBy?: string;
          sortDirection?: 'asc' | 'desc';
        };

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        // Parse the search to check for status filtering
        let statusFilter;
        let searchText = search as string;
        
        if (search && search.includes('status:')) {
          const statusMatch = search.match(/status:(\w+)/);
          if (statusMatch && statusMatch[1]) {
            statusFilter = statusMatch[1].toUpperCase();
            searchText = search.replace(/status:\w+/, '').trim();
          }
        }

        // Build the where clause
        const where: any = {};
        
        if (searchText) {
          where.OR = [
            { prompt: { contains: searchText } },
            { translatedPrompt: { contains: searchText } },
            { userId: { contains: searchText } },
          ];
        }
        
        if (statusFilter) {
          where.status = statusFilter;
        }

        // Build the orderBy object
        const orderBy = {
          [sortBy]: sortDirection
        };

        const generations = await prisma.generation.findMany({
          where,
          orderBy,
          skip,
          take: limitNum,
          include: {
            user: {
              select: {
                email: true,
                telegramUsername: true,
              },
            },
          },
        });

        const totalCount = await prisma.generation.count({ where });

        return reply.send({
          generations,
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalCount / limitNum),
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get generations' });
      }
    }
  );

  // Get generations for a specific user
  fastify.get(
    '/users/:id/generations',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const {
          page = '1',
          limit = '10',
          sortBy = 'createdAt',
          sortDirection = 'desc',
        } = request.query as {
          page?: string;
          limit?: string;
          sortBy?: string;
          sortDirection?: 'asc' | 'desc';
        };

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;

        // Check if user exists
        const userExists = await prisma.user.findUnique({
          where: { id },
          select: { id: true },
        });

        if (!userExists) {
          return reply.status(404).send({ error: 'User not found' });
        }

        // Build the orderBy object
        const orderBy = {
          [sortBy]: sortDirection
        };

        const generations = await prisma.generation.findMany({
          where: { userId: id },
          orderBy,
          skip,
          take: limitNum,
        });

        const totalCount = await prisma.generation.count({
          where: { userId: id },
        });

        return reply.send({
          generations,
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalCount / limitNum),
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get user generations' });
      }
    }
  );

  // Get specific user details (admin only)
  fastify.get(
    '/users/:id',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };

        const user = await prisma.user.findUnique({
          where: { id },
          include: {
            referrals: {
              include: {
                invitedUser: {
                  select: {
                    id: true,
                    email: true,
                    createdAt: true,
                  },
                },
              },
            },
            payments: true,
            generations: {
              take: 20,
              orderBy: { createdAt: 'desc' },
            },
            settings: true,
          },
        });

        if (!user) {
          return reply.status(404).send({ error: 'User not found' });
        }

        // Include all user fields including ban status
        const filteredUser = {
          id: user.id,
          email: user.email,
          remainingGenerations: user.remainingGenerations,
          subscriptionActive: user.subscriptionActive,
          subscriptionEndDate: user.subscriptionEndDate,
          referralCode: user.referralCode,
          telegramUsername: user.telegramUsername,
          telegramId: user.telegramId,
          telegramChatId: user.telegramChatId,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          role: user.role,
          isBanned: user.isBanned,
          banReason: user.banReason,
          bannedAt: user.bannedAt,
          referrals: user.referrals,
          payments: user.payments,
          recentGenerations: user.generations,
          settings: user.settings,
        };

        return reply.send({ user: filteredUser });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get user details' });
      }
    }
  );

  // Update user (admin only)
  fastify.put(
    '/users/:id',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { remainingGenerations, subscriptionActive, subscriptionEndDate, role } =
          request.body as {
            remainingGenerations?: number;
            subscriptionActive?: boolean;
            subscriptionEndDate?: string;
            role?: string;
          };

        const updateData: any = {};

        if (typeof remainingGenerations === 'number') {
          updateData.remainingGenerations = remainingGenerations;
        }

        if (typeof subscriptionActive === 'boolean') {
          updateData.subscriptionActive = subscriptionActive;
        }

        if (subscriptionEndDate) {
          updateData.subscriptionEndDate = new Date(subscriptionEndDate);
        }

        if (role) {
          updateData.role = role;
        }

        const updatedUser = await prisma.user.update({
          where: { id },
          data: updateData,
        });

        return reply.send({
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            remainingGenerations: updatedUser.remainingGenerations,
            subscriptionActive: updatedUser.subscriptionActive,
            subscriptionEndDate: updatedUser.subscriptionEndDate,
            role: updatedUser.role,
            isBanned: updatedUser.isBanned,
            banReason: updatedUser.banReason,
            bannedAt: updatedUser.bannedAt,
          },
        });
      } catch (error) {
        request.log.error(error);

        if ((error as any).code === 'P2025') {
          return reply.status(404).send({ error: 'User not found' });
        }

        return reply.status(500).send({ error: 'Failed to update user' });
      }
    }
  );

  // Get system stats (admin only)
  fastify.get(
    '/stats',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        // Get total counts
        const totalUsers = await prisma.user.count();
        const totalGenerations = await prisma.generation.count();
        const totalPayments = await prisma.payment.count();

        // Get revenue
        const payments = await prisma.payment.findMany({
          where: { status: 'completed' },
          select: { amount: true },
        });

        const totalRevenue = payments.reduce(
          (sum: number, payment: { amount: number }) => sum + payment.amount,
          0
        );

        // Get counts for the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const newUsers = await prisma.user.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        });

        const newGenerations = await prisma.generation.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        });

        const newPayments = await prisma.payment.count({
          where: {
            createdAt: { gte: thirtyDaysAgo },
            status: 'completed',
          },
        });

        const recentPayments = await prisma.payment.findMany({
          where: {
            createdAt: { gte: thirtyDaysAgo },
            status: 'completed',
          },
          select: { amount: true },
        });

        const recentRevenue = recentPayments.reduce(
          (sum: number, payment: { amount: number }) => sum + payment.amount,
          0
        );

        return reply.send({
          stats: {
            users: {
              total: totalUsers,
              last30Days: newUsers,
            },
            generations: {
              total: totalGenerations,
              last30Days: newGenerations,
            },
            payments: {
              total: totalPayments,
              last30Days: newPayments,
            },
            revenue: {
              total: totalRevenue,
              last30Days: recentRevenue,
            },
          },
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get system stats' });
      }
    }
  );

  // Manual cleanup trigger (admin only)
  fastify.post(
    '/maintenance/cleanup',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        // Run all cleanup tasks
        await runAllCleanupTasks();
        
        return reply.send({
          success: true,
          message: 'Cleanup tasks initiated successfully'
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ 
          error: 'Failed to run cleanup tasks',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );
  
  // Payment cleanup only (admin only)
  fastify.post(
    '/maintenance/cleanup-payments',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const { olderThanHours } = request.body as { olderThanHours?: number };
        
        // Convert hours to milliseconds, default to 1 hour if not specified
        const olderThanMs = (olderThanHours || 1) * 3600000;
        
        // Import the cleanupPendingPayments function directly to use custom time
        const { cleanupPendingPayments } = await import('../services/payment');
        
        // Run payment cleanup with custom time parameter
        const count = await cleanupPendingPayments(olderThanMs);
        
        return reply.send({
          success: true,
          message: `Payment cleanup completed successfully. Removed ${count} stale payments.`,
          data: { 
            removedCount: count,
            olderThanHours: olderThanHours || 1
          }
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ 
          error: 'Failed to run payment cleanup',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  );

  // Get all Reve accounts (admin only)
  fastify.get(
    '/reve-accounts',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const accounts = await prisma.reveAccount.findMany({
          orderBy: { lastUsedAt: 'desc' },
        });

        return reply.send({ accounts });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get Reve accounts' });
      }
    }
  );

  // Add a new Reve account (admin only)
  fastify.post(
    '/reve-accounts',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const { authorization, cookie, projectId } = request.body as {
          authorization: string;
          cookie: string;
          projectId: string;
        };

        if (!authorization || !cookie || !projectId) {
          return reply.status(400).send({ error: 'Missing required fields' });
        }

        const account = await prisma.reveAccount.create({
          data: {
            authorization,
            cookie,
            projectId,
            isActive: true,
          },
        });

        return reply.send({
          account: {
            id: account.id,
            projectId: account.projectId,
            isActive: account.isActive,
            lastErrorAt: account.lastErrorAt,
            lastUsedAt: account.lastUsedAt,
            generationCount: account.generationCount,
            createdAt: account.createdAt,
          },
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to create Reve account' });
      }
    }
  );

  // Update a Reve account (admin only)
  fastify.put(
    '/reve-accounts/:id',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { authorization, cookie, projectId, isActive } = request.body as {
          authorization?: string;
          cookie?: string;
          projectId?: string;
          isActive?: boolean;
        };

        const updateData: any = {};

        if (authorization) updateData.authorization = authorization;
        if (cookie) updateData.cookie = cookie;
        if (projectId) updateData.projectId = projectId;
        if (typeof isActive === 'boolean') updateData.isActive = isActive;

        const account = await prisma.reveAccount.update({
          where: { id },
          data: updateData,
        });

        return reply.send({
          account: {
            id: account.id,
            projectId: account.projectId,
            isActive: account.isActive,
            lastErrorAt: account.lastErrorAt,
            lastUsedAt: account.lastUsedAt,
            generationCount: account.generationCount,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
          },
        });
      } catch (error) {
        request.log.error(error);

        if ((error as any).code === 'P2025') {
          return reply.status(404).send({ error: 'Reve account not found' });
        }

        return reply.status(500).send({ error: 'Failed to update Reve account' });
      }
    }
  );

  // Delete a Reve account (admin only)
  fastify.delete(
    '/reve-accounts/:id',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };

        await prisma.reveAccount.delete({
          where: { id },
        });

        return reply.send({ success: true });
      } catch (error) {
        request.log.error(error);

        if ((error as any).code === 'P2025') {
          return reply.status(404).send({ error: 'Reve account not found' });
        }

        return reply.status(500).send({ error: 'Failed to delete Reve account' });
      }
    }
  );
  
  // Reset error status for a Reve account (admin only)
  fastify.post(
    '/reve-accounts/:id/reset-error',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };

        const account = await prisma.reveAccount.update({
          where: { id },
          data: { lastErrorAt: null },
        });

        return reply.send({
          account: {
            id: account.id,
            projectId: account.projectId,
            isActive: account.isActive,
            lastErrorAt: account.lastErrorAt,
            lastUsedAt: account.lastUsedAt,
            generationCount: account.generationCount,
          },
        });
      } catch (error) {
        request.log.error(error);

        if ((error as any).code === 'P2025') {
          return reply.status(404).send({ error: 'Reve account not found' });
        }

        return reply.status(500).send({ error: 'Failed to reset account error status' });
      }
    }
  );

  // Ban user (admin only)
  fastify.post(
    '/users/:id/ban',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { reason } = request.body as { reason?: string };

        const user = await prisma.user.update({
          where: { id },
          data: {
            isBanned: true,
            banReason: reason || 'Banned by administrator',
            bannedAt: new Date(),
          },
        });

        return reply.send({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            isBanned: user.isBanned,
            banReason: user.banReason,
            bannedAt: user.bannedAt,
          },
        });
      } catch (error) {
        request.log.error(error);

        if ((error as any).code === 'P2025') {
          return reply.status(404).send({ error: 'User not found' });
        }

        return reply.status(500).send({ error: 'Failed to ban user' });
      }
    }
  );

  // Unban user (admin only)
  fastify.post(
    '/users/:id/unban',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };

        const user = await prisma.user.update({
          where: { id },
          data: {
            isBanned: false,
            banReason: null,
            bannedAt: null,
          },
        });

        return reply.send({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            isBanned: user.isBanned,
          },
        });
      } catch (error) {
        request.log.error(error);

        if ((error as any).code === 'P2025') {
          return reply.status(404).send({ error: 'User not found' });
        }

        return reply.status(500).send({ error: 'Failed to unban user' });
      }
    }
  );

  // Get payments with filters (admin only)
  fastify.get(
    '/payments',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const { page = 1, limit = 10, search = '', sortBy = 'createdAt', sortDirection = 'desc', status } = request.query as {
          page?: number;
          limit?: number;
          search?: string;
          sortBy?: string;
          sortDirection?: 'asc' | 'desc';
          status?: string;
        };

        // Convert to numbers
        const pageNum = Number(page);
        const limitNum = Number(limit);
        const skip = (pageNum - 1) * limitNum;

        // Prepare filter conditions
        const whereConditions: any = {};
        
        // Add status filter if provided
        if (status && status !== 'all') {
          whereConditions.status = status;
        }
        
        // Add search filter if provided
        if (search) {
          whereConditions.OR = [
            {
              user: {
                email: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
            {
              user: {
                telegramUsername: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
            {
              user: {
                telegramId: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
            {
              transactionId: {
                equals: isNaN(parseInt(search)) ? undefined : parseInt(search),
              },
            },
          ];
        }

        // Get total count first
        const totalPayments = await prisma.payment.count({
          where: whereConditions,
        });

        // Then get paginated data
        const payments = await prisma.payment.findMany({
          where: whereConditions,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                telegramUsername: true,
                telegramId: true,
              },
            },
          },
          orderBy: {
            [sortBy]: sortDirection,
          },
          skip,
          take: limitNum,
        });

        return reply.send({
          payments,
          total: totalPayments,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(totalPayments / limitNum),
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get payments' });
      }
    }
  );

  // Get payment by ID (admin only)
  fastify.get(
    '/payments/:id',
    {
      preHandler: [(fastify as any).authenticate],
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };

        const payment = await prisma.payment.findUnique({
          where: { id },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                telegramUsername: true,
                telegramId: true,
              },
            },
          },
        });

        if (!payment) {
          return reply.status(404).send({ error: 'Payment not found' });
        }

        return reply.send({ payment });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Failed to get payment' });
      }
    }
  );
}
