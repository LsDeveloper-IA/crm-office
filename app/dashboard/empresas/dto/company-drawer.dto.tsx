export type CompanyDrawerDTO = {
  cnpj: string;
  name: string;

  taxRegime?: {
    key: string;
    name: string;
  };
  
  accountant?: string;
  group?: string;
  thirteenth?: boolean;

  paysFees?: boolean;
  paysSystem?: boolean;

  feesType?: string;
  feesValue?: number;

  systemName?: string;
  systemValue?: number;

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

  partners?: {
    name: string;
    cpf: string | null;
    cnpj: string | null;
    isCorporate: boolean;
    birthDate: string | null;
    percentage: number | null;
    valueCents: string | null;
    quotas: string | null;
  }[];

  activities: {
    cnaeCode: string;
    description: string;
    kind: string;
  }[];

  companySectorsOwners: {
    companySectorId: string;
    name: string;
  }[];
};
