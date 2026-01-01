import prisma from "@/lib/prisma";
import { fetchCompanyFromReceita } from "@/lib/receita/receita.client";
import { mapReceitaToCompany } from "@/lib/receita/receita.mapper";

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
  const receita = await fetchCompanyFromReceita(cnpj);

  // 3. Mapear para o domínio
  const mapped = mapReceitaToCompany(receita);

  // 4. Criar empresa
  const company = await prisma.company.create({
    data: {
      cnpj,

      // dados mapeados
      name: mapped.name,
      fantasy: mapped.fantasy,
      status: mapped.status,
      type: mapped.type,
      size: mapped.size,
      legalNature: mapped.legalNature,

      publicSpace: mapped.publicSpace,
      number: mapped.number,
      district: mapped.district,
      city: mapped.city,
      state: mapped.state,
      zipCode: mapped.zipCode,

      email: mapped.email,
      telephone: mapped.telephone,
      opening: mapped.opening,

      rawData: receita, // aqui sim, payload bruto da Receita

      qsas: {
        create: mapped.qsas,
      },

      activities: {
        create: mapped.activities,
      },
    },
  });

  return company;
}