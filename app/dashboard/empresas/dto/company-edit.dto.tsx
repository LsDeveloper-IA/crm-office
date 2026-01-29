export type CompanyEditDTO = {
  name?: string;

  taxRegime?: {
    key: string;
    name: string;
  };

  accountant?: string;

  // HONORÁRIOS
  paysFees?: boolean;
  feesType?: "FIXO" | "PERCENTUAL" | "PACOTE";
  feesValue?: number;

  // SISTEMA
  paysSystem?: boolean;
  systemName?: string;
  systemValue?: number;

  publicSpace?: string;
  number?: string;
  district?: string;
  city?: string;
  state?: string;

  companySectors: {
    sectorId: string;
    sectorName: string;
    owner?: string;
  }[];
};