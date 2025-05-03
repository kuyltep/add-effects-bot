import { PrismaClient } from '@prisma/client';

// Create a global singleton instance of Prisma
let prismaInstance: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient();

    // Log when a new instance is created
    console.log('Prisma Client instance created');
  }

  return prismaInstance;
}

export const prisma = getPrismaClient();

// Handle shutdown
process.on('beforeExit', async () => {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    console.log('Prisma Client disconnected');
  }
});
