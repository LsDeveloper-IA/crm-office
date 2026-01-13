/*
  Warnings:

  - You are about to drop the column `taxRegime` on the `CompanyProfile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CompanyProfile" DROP COLUMN "taxRegime",
ADD COLUMN     "taxRegimeId" INTEGER;

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_taxRegimeId_fkey" FOREIGN KEY ("taxRegimeId") REFERENCES "TaxRegime"("id") ON DELETE SET NULL ON UPDATE CASCADE;
