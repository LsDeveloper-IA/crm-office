// app/dashboard/empresas/dto/company-edit.dto.ts

export type CompanyEditDTO = {
  // dados gerais editáveis
  name: string;
  taxRegime?: string;
  accountant?: string;
  accountants?: string;

  // endereço (somente leitura)
  publicSpace?: string;
  number?: string;
  district?: string;
  city?: string;
  state?: string;

  // setores editáveis
  companySectors: {
    sectorId: number | string;
    sectorName: string;
    owner?: string;
    tempId?: string;
  }[];
};