/*
  Warnings:

  - You are about to drop the column `partnerName` on the `ProfitDistribution` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[companyCnpj,partnerId,referenceDate]` on the table `ProfitDistribution` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `partnerId` to the `ProfitDistribution` table without a default value. This is not possible if the table is not empty.
  - Added the required column `referenceDate` to the `ProfitDistribution` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ProfitDistribution" DROP COLUMN "partnerName",
ADD COLUMN     "partnerId" INTEGER NOT NULL,
ADD COLUMN     "referenceDate" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "participationPercentage" DROP NOT NULL,
ALTER COLUMN "amount" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ProfitPartner" (
    "id" SERIAL NOT NULL,
    "companyCnpj" VARCHAR(14) NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ProfitPartner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfitPartner_companyCnpj_idx" ON "ProfitPartner"("companyCnpj");

-- CreateIndex
CREATE UNIQUE INDEX "ProfitDistribution_companyCnpj_partnerId_referenceDate_key" ON "ProfitDistribution"("companyCnpj", "partnerId", "referenceDate");

-- AddForeignKey
ALTER TABLE "ProfitDistribution" ADD CONSTRAINT "ProfitDistribution_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "ProfitPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitPartner" ADD CONSTRAINT "ProfitPartner_companyCnpj_fkey" FOREIGN KEY ("companyCnpj") REFERENCES "Company"("cnpj") ON DELETE RESTRICT ON UPDATE CASCADE;
