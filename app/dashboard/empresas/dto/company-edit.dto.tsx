// dto/company-edit.dto.ts
export type CompanyEditDTO = {
  name: string;

  taxRegime?: {
    key: string;
    name: string;
  };

  accountant?: string;
<<<<<<< HEAD
  paysFees: boolean;
=======
  paysFees?: boolean;
  group?: string;
  
  feesType?: string;
  feesValue?: number;
  
  paysSystem?: boolean;
  systemName?: string;
  systemValue?: number;
>>>>>>> origin/feature/Filter

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