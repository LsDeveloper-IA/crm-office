ALTER TABLE "ProfitPartner" ADD COLUMN "cpf" VARCHAR(11),
  ADD COLUMN "birthDate" VARCHAR(10), ADD COLUMN "ownershipHistory" JSONB;
CREATE UNIQUE INDEX "ProfitPartner_companyCnpj_cpf_key" ON "ProfitPartner"("companyCnpj", "cpf");
