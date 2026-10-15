import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from '@prisma/adapter-pg';

declare global {
  var __prisma: PrismaClient | undefined;
  var __prismaSchema: string | undefined;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set.');
}

// Hot reload can retain a client created before `prisma generate` changed the model.
const schema = JSON.stringify(Prisma.dmmf.datamodel);
const cached = process.env.NODE_ENV !== 'production' && globalThis.__prismaSchema === schema
  ? globalThis.__prisma : undefined;
if (!cached && process.env.NODE_ENV !== 'production' && globalThis.__prisma) {
  void globalThis.__prisma.$disconnect().catch(() => {
    console.warn('Não foi possível encerrar o Prisma Client anterior durante hot reload.');
  });
}
const prisma = cached || new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
  globalThis.__prismaSchema = schema;
}

export default prisma;
