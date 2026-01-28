// dto/company-edit.dto.ts
export type CompanyEditDTO = {
  name: string;

  taxRegime?: {
    key: string;
    name: string;
  };

  accountant?: string;
  paysFees: boolean;

  publicSpace?: string;
  number?: string;
  district?: string;
  city?: string;
  state?: string;

  companySectors: {
    sectorId: string;
    sectorName: string;
    owner?: string;

    owners?: {
      id?: string;
      name: string;
    }[];
  }[];
};