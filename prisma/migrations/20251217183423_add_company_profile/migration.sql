-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" SERIAL NOT NULL,
    "companyCnpj" VARCHAR(14) NOT NULL,
    "taxRegime" TEXT,
    "accountant" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_companyCnpj_key" ON "CompanyProfile"("companyCnpj");

-- CreateIndex
CREATE INDEX "CompanyProfile_companyCnpj_idx" ON "CompanyProfile"("companyCnpj");

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_companyCnpj_fkey" FOREIGN KEY ("companyCnpj") REFERENCES "Company"("cnpj") ON DELETE RESTRICT ON UPDATE CASCADE;
