/*
  Warnings:

  - You are about to drop the column `createdAt` on the `CompanyProfile` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `CompanyProfile` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `CompanyProfile` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "FeesType" AS ENUM ('FIXO', 'PERCENTUAL', 'PACOTE');

-- DropIndex
DROP INDEX "CompanyProfile_companyCnpj_idx";

-- AlterTable
ALTER TABLE "CompanyProfile" DROP COLUMN "createdAt",
DROP COLUMN "notes",
DROP COLUMN "updatedAt",
ADD COLUMN     "feesType" "FeesType",
ADD COLUMN     "feesValue" DECIMAL(10,2),
ADD COLUMN     "paysSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "systemName" TEXT,
ADD COLUMN     "systemValue" DECIMAL(10,2);
