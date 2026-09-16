CREATE TABLE "ProfitCompanySettings" (
    "companyCnpj" VARCHAR(14) NOT NULL,
    "referenceYear" INTEGER NOT NULL,
    "participationPercentage" DECIMAL(5,2),
    "dividendTaxation" "DividendTaxation",
    "status" "ProfitDistributionStatus" NOT NULL DEFAULT 'NAO_ENCERRADO',
    "observation" TEXT,
    CONSTRAINT "ProfitCompanySettings_pkey" PRIMARY KEY ("companyCnpj", "referenceYear"),
    CONSTRAINT "ProfitCompanySettings_companyCnpj_fkey" FOREIGN KEY ("companyCnpj") REFERENCES "Company"("cnpj") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProfitCompanySettings_referenceYear_fkey" FOREIGN KEY ("referenceYear") REFERENCES "AnoReferencia"("year") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProfitCompanySettings_percentage_check" CHECK ("participationPercentage" BETWEEN 0 AND 100)
);
