export type CompanyEditUI = {
  name: string;

  taxRegime?: {
    key: string;
    name: string;
  };

  accountant?: string;

  paysFees: boolean;
  feesType?: "FIXO" | "PERCENTUAL" | "PACOTE";
  feesValue?: number;

  paysSystem?: boolean;
  systemName?: string;
  systemValue?: number;

  publicSpace?: string;
  number?: string;
  district?: string;
  city?: string;
  state?: string;

  companySectors: UISector[];
};