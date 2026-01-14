export type CompanyDrawerDTO = {
  cnpj: string;
  name: string;

  taxRegime?: {
    key: string;
    name: string;
  };
  
  accountant?: string;

  address?: {
    publicSpace?: string;
    number?: string;
    district?: string;
    city?: string;
    state?: string;
  };

  companySectors: {
    sectorId: string;        // ✅ SEMPRE STRING
    sectorName: string;
    owner?: string;
  }[];

  qsas: {
    nome: string;
    qualificacao: string;
  }[];

  activities: {
    cnaeCode: string;
    description: string;
    kind: string;
  }[];
};