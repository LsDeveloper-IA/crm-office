export type CompanyDrawerDTO = {
  cnpj: string;
  name: string;

  taxRegime?: {
    key: string;
    name: string;
  };

  accountant?: string;
  group?: string;

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
    companySectorId?: number; // 🔑 vínculo com o banco
    sectorId: string;
    sectorName: string;

    // ✅ NOVO MODELO
    owners: {
      id?: number;
      name: string;
    }[];

    // 🔒 LEGADO (opcional, pode matar depois)
    ownerLegacy?: string;
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