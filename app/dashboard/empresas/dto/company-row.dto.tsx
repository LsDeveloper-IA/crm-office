// app/dashboard/empresas/dto/company-row.dto.ts
export type CompanyRowDTO = {
  cnpj: string;
  name: string;

  taxRegime?: {
    key: string;
    name: string;
  };
  
  accountant: string;
  paysFees: boolean;
};