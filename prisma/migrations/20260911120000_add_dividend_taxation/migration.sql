CREATE TYPE "DividendTaxation" AS ENUM ('ISENTO', 'TRIBUTADO');

ALTER TABLE "ProfitDistribution" ADD COLUMN "dividendTaxation" "DividendTaxation";
