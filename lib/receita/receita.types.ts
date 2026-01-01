// lib/receita/receita.types.ts
export type ReceitaResponse = {
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