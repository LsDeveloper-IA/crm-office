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

  companySectors: {
    sectorId: string;     // 🔥 ESSENCIAL
    sectorName: string;
    owner?: string;
    ownerId?: string | null;
  }[];

  qsas: {
    nome: string;
    qualificacao: string;
  }[];

  activities: {
    cnaeCode: string;
    description?: string;
    kind: "PRIMARY" | "SECONDARY";
  }[];
};