export type CompanyEditDTO = {
  name: string;
  taxRegime?: string;
  accountant?: string;

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