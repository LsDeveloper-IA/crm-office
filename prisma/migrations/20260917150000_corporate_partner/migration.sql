ALTER TABLE "ProfitPartner" ADD COLUMN "partnerCnpj" VARCHAR(14);
CREATE UNIQUE INDEX "ProfitPartner_companyCnpj_partnerCnpj_key" ON "ProfitPartner"("companyCnpj", "partnerCnpj");
