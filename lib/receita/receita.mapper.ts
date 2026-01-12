// lib/receita/receita.mapper.ts
import type { ReceitaResponse } from "./receita.types";

export function mapReceitaToCompany(data: ReceitaResponse) {
  return {
    name: data.nome,
    fantasy: data.fantasia,
    status: data.situacao,
    type: data.tipo,
    size: data.porte,
    legalNature: data.natureza_juridica,

    publicSpace: data.logradouro,
    number: data.numero,
    district: data.bairro,
    city: data.municipio,
    state: data.uf,
    zipCode: data.cep,

    email: data.email,
    telephone: data.telefone,

    opening: new Date(
      data.abertura.split("/").reverse().join("-")
    ),

    qsas: data.qsa.map((q) => ({
      nome: q.nome,
      qualificacao: q.qual,
    })),

    activities: [
      ...data.atividade_principal.map((a) => ({
        cnaeCode: a.code,
        description: a.text,
        kind: "PRIMARY" as const,
      })),
      ...data.atividades_secundarias.map((a) => ({
        cnaeCode: a.code,
        description: a.text,
        kind: "SECONDARY" as const,
      })),
    ],
  };
}