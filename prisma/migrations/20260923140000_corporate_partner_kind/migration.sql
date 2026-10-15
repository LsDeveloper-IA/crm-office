ALTER TABLE "ProfitPartner" ADD COLUMN "isCorporate" BOOLEAN NOT NULL DEFAULT false;
UPDATE "ProfitPartner" SET "isCorporate" = true WHERE "partnerCnpj" IS NOT NULL;
