export type CompanyRowDTO = {
  cnpj: string;
  name: string | null;
  profile: {
    taxRegime: string | null;
    accountant: string | null;
  } | null;
  companySectors: {
    sector: {
      name: string;
    };
    owner: {
      username: string;
    } | null;
  }[];
};