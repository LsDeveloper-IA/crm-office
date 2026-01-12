export type CompanyDrawerDTO = {
  cnpj: string;
  name: string;

  taxRegime?: string;
  accountant?: string;

  address: {
    publicSpace?: string;
    number?: string;
    district?: string;
    city?: string;
    state?: string;
  };

  qsas: {
    nome: string;
    qualificacao: string;
  }[];

  activities: {
    cnaeCode: string;
    description?: string;
    kind: "PRIMARY" | "SECONDARY";
  }[];

  companySectors: {
    sectorName: string;
    owner?: string;
  }[];
};