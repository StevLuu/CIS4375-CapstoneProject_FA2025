import { PrismaClient } from "@prisma/client";

// Avoid creating many clients during dev hot-reload
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'] // add 'query' for debugging if needed
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
