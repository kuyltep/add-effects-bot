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

// Function to manually disconnect Prisma (should be called from main process)
export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    console.log('Prisma Client disconnected');
    prismaInstance = undefined;
  }
}
