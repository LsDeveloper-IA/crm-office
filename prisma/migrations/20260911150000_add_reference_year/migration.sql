BEGIN;

LOCK TABLE "ProfitDistribution" IN ACCESS EXCLUSIVE MODE;

CREATE TABLE "AnoReferencia" (
  "year" INTEGER NOT NULL,
  CONSTRAINT "AnoReferencia_pkey" PRIMARY KEY ("year")
);
INSERT INTO "AnoReferencia" ("year") VALUES (2025), (2026);

ALTER TABLE "ProfitDistribution" ADD COLUMN "referenceYear" INTEGER;
ALTER TABLE "ProfitDistribution" ADD COLUMN "referenceMonth" INTEGER;
-- The old UI used the date to identify the month. Extract it once, then keep
-- the original timestamp intact: it is independent of the accounting year.
UPDATE "ProfitDistribution"
SET "referenceYear" = 2025, "referenceMonth" = EXTRACT(MONTH FROM "referenceDate")::integer;

DROP INDEX "ProfitDistribution_companyCnpj_partnerId_referenceDate_key";
CREATE UNIQUE INDEX "ProfitDistribution_period_date_key" ON "ProfitDistribution"
  ("companyCnpj", "partnerId", "referenceYear", "referenceMonth", "referenceDate");

-- Copy every field, including legacy records with different times in one month.
INSERT INTO "ProfitDistribution" (
  "companyCnpj", "partnerId", "referenceDate", "referenceYear", "referenceMonth",
  "participationPercentage", "dividendTaxation", "amount", "status", "observation"
)
SELECT "companyCnpj", "partnerId", "referenceDate", 2026, "referenceMonth",
  "participationPercentage", "dividendTaxation", "amount", "status", "observation"
FROM "ProfitDistribution" WHERE "referenceYear" = 2025 ORDER BY "id";

ALTER TABLE "ProfitDistribution" ALTER COLUMN "referenceYear" SET NOT NULL;
ALTER TABLE "ProfitDistribution" ALTER COLUMN "referenceMonth" SET NOT NULL;
ALTER TABLE "ProfitDistribution" ALTER COLUMN "referenceDate" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ProfitDistribution" ADD CONSTRAINT "ProfitDistribution_referenceYear_fkey"
  FOREIGN KEY ("referenceYear") REFERENCES "AnoReferencia"("year") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfitDistribution" ADD CONSTRAINT "ProfitDistribution_referenceMonth_check"
  CHECK ("referenceMonth" BETWEEN 1 AND 12);
CREATE INDEX "ProfitDistribution_referenceYear_idx" ON "ProfitDistribution"("referenceYear");

COMMIT;
