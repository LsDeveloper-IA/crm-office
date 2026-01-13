/*
  Warnings:

  - You are about to drop the column `ownerId` on the `CompanySector` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "CompanySector" DROP CONSTRAINT "CompanySector_ownerId_fkey";

-- AlterTable
ALTER TABLE "CompanySector" DROP COLUMN "ownerId",
ALTER COLUMN "ownerName" SET DATA TYPE TEXT;
