export type CompanyCreateDTO = {
  cnpj: string;

  taxRegime?: string;
  accountant?: string;

  contacts?: {
    email?: string;
    phone?: string;
  };

  companySectors: {
    sectorId: string;
  }[];
};