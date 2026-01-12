export type CompanyDetailsDTO = {
  cnpj: string;
  name: string | null;

  publicSpace: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;

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

  qsas: {
    nome: string;
    qualificacao: string;
  }[];

  atividades: {
    cnaeCode: string;
    description: string | null;
    kind: "PRIMARY" | "SECONDARY";
  }[];
};