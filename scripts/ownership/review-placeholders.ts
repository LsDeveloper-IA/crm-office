import "dotenv/config";
import { randomUUID } from "node:crypto";
import prisma from "../../lib/prisma";

const reason = "Cadastro provisório Sem sócios possui lançamentos financeiros; conciliar manualmente com os sócios identificados";

async function main() {
  const placeholders = await prisma.profitPartner.findMany({
    where: { name: { equals: "Sem sócios", mode: "insensitive" } },
    select: { companyCnpj: true, _count: { select: { distributions: true } } },
  });
  let flagged = 0;
  for (const item of placeholders) {
    if (!item._count.distributions) continue;
    const otherPartners = await prisma.profitPartner.count({
      where: { companyCnpj: item.companyCnpj, NOT: { name: { equals: "Sem sócios", mode: "insensitive" } } },
    });
    if (!otherPartners) continue;
    const existing = await prisma.ownershipProcessingRun.findFirst({
      where: { companyCnpj: item.companyCnpj, status: "NEEDS_REVIEW",
        stage: "financial-reconciliation", errorMessage: reason }, select: { id: true },
    });
    if (existing) continue;
    await prisma.ownershipProcessingRun.create({ data: {
      correlationId: randomUUID(), companyCnpj: item.companyCnpj,
      status: "NEEDS_REVIEW", stage: "financial-reconciliation",
      errorCode: "PLACEHOLDER_DISTRIBUTIONS", errorMessage: reason, finishedAt: new Date(),
    } });
    flagged++;
  }
  console.log(`PLACEHOLDER_REVIEW flagged=${flagged}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
