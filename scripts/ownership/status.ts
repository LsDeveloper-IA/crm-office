import prisma from "../../lib/prisma";

async function main() {
  const cnpj = process.argv[2];
  if (!cnpj || !/^\d{14}$/.test(cnpj)) throw new Error("Informe o CNPJ com 14 dígitos");
  const company = await prisma.company.findFirst({
    where: { cnpj, deletedAt: null },
    select: { name: true, profitPartners: { select: {
      id: true, name: true, cpf: true, partnerCnpj: true, birthDate: true, ownershipHistory: true, qsaPeriods: true,
    } } },
  });
  console.log(JSON.stringify(company && { name: company.name, partners: company.profitPartners.map(p => ({
    id: p.id, name: p.name, hasCpf: !!p.cpf, hasCnpj: !!p.partnerCnpj, hasBirthDate: !!p.birthDate,
    events: Array.isArray(p.ownershipHistory) ? p.ownershipHistory.length : 0, periods: p.qsaPeriods,
  })) }, null, 2));
}
main().catch(error => { console.error(error.code ?? error.name, "Falha ao consultar cadastro societário."); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
