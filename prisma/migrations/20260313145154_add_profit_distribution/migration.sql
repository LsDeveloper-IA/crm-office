-- CreateEnum
CREATE TYPE "ProfitDistributionStatus" AS ENUM ('NAO_ENCERRADO', 'ENCERRADO_COM_LUCRO', 'ENCERRADO_COM_PREJUIZO');

-- CreateTable
CREATE TABLE "ProfitDistribution" (
    "id" SERIAL NOT NULL,
    "companyCnpj" VARCHAR(14) NOT NULL,
    "partnerName" TEXT NOT NULL,
    "participationPercentage" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "status" "ProfitDistributionStatus" NOT NULL DEFAULT 'NAO_ENCERRADO',
    "observation" TEXT,

    CONSTRAINT "ProfitDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfitDistribution_companyCnpj_idx" ON "ProfitDistribution"("companyCnpj");

-- AddForeignKey
ALTER TABLE "ProfitDistribution" ADD CONSTRAINT "ProfitDistribution_companyCnpj_fkey" FOREIGN KEY ("companyCnpj") REFERENCES "Company"("cnpj") ON DELETE RESTRICT ON UPDATE CASCADE;
