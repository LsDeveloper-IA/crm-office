export type ReceiraResponse = {
  cnpj: string;
  nome: string;
  fantasia: string;
  situacao: string;
  tipo: string;
  porte: string;
  natureza_juridica: string;
  abertura: string;
  email: string;
  telefone: string;
  municipio: string;
  uf: string;
  bairro: string;
  logradouro: string;
  numero: string;
  cep: string;

  qsa: {
    nome: string;
    qual: string;
  }[];

  atividade_principal: {
    code: string;
    text: string;
  }[];

  atividades_secundarias: {
    code: string;
    text: string;
  }[];
};

export async function fetchCompanyFromReceita(cnpj: string): Promise<ReceiraResponse> {
  const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Erro ao consultar a Receita");
  }

  const data = await res.json();

  if (data.status === "ERROR") {
    throw new Error(data.message || "CNPJ inválido");
  }

  return data;
} 