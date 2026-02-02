export type CompanyEditDTO = {
  name?: string;

  taxRegime?: {
    key: string;
    name: string;
  };

  accountant?: string;
  paysFees?: boolean;

  publicSpace?: string;
  number?: string;
  district?: string;
  city?: string;
  state?: string;

  companySectors: {
    companySectorId?: number;
    sectorId: string;
    sectorName: string;

    owners: {
      id?: number;
      name: string;
    }[];

    ownerLegacy?: string;
  }[];
};