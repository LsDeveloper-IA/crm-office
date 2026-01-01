import prisma from "@/lib/prisma";
import { fetchCompanyFromReceita } from "@/lib/receita/receita.client";
import { mapReceitaToCompany } from "@/lib/receita/receita.mapper";

export async function refreshCompanyByCnpj(cnpj: string) {
  // 1. Busca dados na Receita
  const receita = await fetchCompanyFromReceita(cnpj);

  // 2. Mapeia para o domínio
  const mapped = mapReceitaToCompany(receita);

  // 3. Atualiza tudo em transação
  await prisma.$transaction(async (tx) => {
    // Atualiza dados principais
    await tx.company.update({
      where: { cnpj },
      data: {
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

        lastUpdate: new Date(),
        rawData: receita, // payload cru para auditoria
      },
    });

    // Recria QSA
    await tx.companyQsa.deleteMany({
      where: { companyCnpj: cnpj },
    });

    if (mapped.qsas.length > 0) {
      await tx.companyQsa.createMany({
        data: mapped.qsas.map((q) => ({
          companyCnpj: cnpj,
          nome: q.nome,
          qualificacao: q.qualificacao,
        })),
      });
    }

    // Recria atividades
    await tx.companyActivity.deleteMany({
      where: { companyCnpj: cnpj },
    });

    if (mapped.activities.length > 0) {
      await tx.companyActivity.createMany({
        data: mapped.activities.map((a) => ({
          companyCnpj: cnpj,
          cnaeCode: a.cnaeCode,
          description: a.description,
          kind: a.kind,
        })),
      });
    }
  });
}