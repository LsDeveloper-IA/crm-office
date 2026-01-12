import { PrismaClient } from "@prisma/client";
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  // allow global prisma during dev to avoid exhausting connections
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = globalThis.__prisma || new PrismaClient({adapter});

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

export default prisma;