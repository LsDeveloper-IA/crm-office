// prisma/seed.ts
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

/**
 * IMPORTANT:
 * - If your generated client is at a different path, change the import above.
 * - This file is intended to be executed by `tsx prisma/seed.ts` (Prisma v7 recommended).
 */

// Create the adapter with your DATABASE_URL (Neon)
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

// Create Prisma client instance with adapter
const prisma = new PrismaClient({ adapter });

// -----------------------------
// Seed data (customize as needed)
// -----------------------------

const adminPasswordPlain = process.env.SEED_ADMIN_PASSWORD ?? "Office@123";
const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@office.local";

const sectors: Prisma.SectorCreateInput[] = [
  { key: "CONTABIL", name: "Contábil" },
  { key: "FISCAL", name: "Fiscal" },
  { key: "PESSOAL", name: "Pessoal" },
];

const systems: Prisma.SystemCreateInput[] = [
  { key: "ERP", name: "Domínio Sistemas" },
  { key: "PORTAL", name: "Portal do Cliente" },
  { key: "ISS", name: "Conthabil ISS" },
  { key: "HUBSTROM", name: "Hubstrom" },
];

// -----------------------------
// main()
// -----------------------------
export async function main() {
  console.log("🌱 Running DB seed...");

  // ---------- Admin user ----------
  const hashedPassword = await bcrypt.hash(adminPasswordPlain, 10);

  // Upsert admin (idempotent)
  await prisma.user.upsert({
    where: { username: adminEmail },
    update: {
      name: "Administrator",
      password: hashedPassword,
      role: "ADMIN",
      active: true,
      updatedAt: new Date(),
    },
    create: {
      username: adminEmail,
      name: "Administrator",
      password: hashedPassword,
      role: "ADMIN",
      active: true,
    },
  });
  console.log(`✔ Admin upserted: ${adminEmail}`);

  // ---------- Sectors ----------
  for (const s of sectors) {
    await prisma.sector.upsert({
      where: { key: s.key },
      update: { name: s.name, updatedAt: new Date() },
      create: s,
    });
  }
  console.log("✔ Sectors upserted");

  // ---------- Systems ----------
  for (const sys of systems) {
    await prisma.system.upsert({
      where: { key: sys.key },
      update: { name: sys.name, updatedAt: new Date() },
      create: sys,
    });
  }
  console.log("✔ Systems upserted");

  // Add here additional seeds if you want (contacts, example companies, etc.)
  console.log("🏁 Seed finished.");
}

// If you run this file directly with tsx (or ts-node), execute main()
if (require.main === module) {
  main()
    .catch((e) => {
      console.error("Seed error:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}