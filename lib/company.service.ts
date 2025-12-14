import prisma from "./prisma";
import { fetchCompanyFromReceita } from "./receita";

export async function getOrCreateCompanyByCnpj(cnpj: string) {
  // 1. Já existe?
  const existing = await prisma.company.findUnique({
    where: { cnpj },
    include: {
      qsas: true,
      activities: true,
    },
  });

  if (existing) return existing;

  // 2. Buscar na Receita
  const data = await fetchCompanyFromReceita(cnpj);

  // 3. Criar empresa
  const company = await prisma.company.create({
    data: {
      cnpj,
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

      opening: new Date(data.abertura.split("/").reverse().join("-")),
      rawData: data,

      qsas: {
        create: data.qsa.map((q) => ({
          nome: q.nome,
          qualificacao: q.qual,
        })),
      },

      activities: {
        create: [
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
      },
    },
  });

  return company;
}