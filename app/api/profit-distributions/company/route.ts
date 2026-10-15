import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireDistributionUser } from "@/lib/profit-distribution-auth";
import { isValidDistributionNumber } from "@/lib/profit-distribution-input";
import { isDividendTaxation } from "@/lib/dividend-taxation";
import { isProfitDistributionStatus } from "@/lib/profit-distribution-status";

export async function PUT(request: Request) {
  const denied = await requireDistributionUser();
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)
    || typeof body.companyCnpj !== "string" || !/^\d{14}$/.test(body.companyCnpj)
    || !Number.isInteger(body.year) || body.year < 2025 || body.year > 9999
    || body.participationPercentage === undefined
    || !isValidDistributionNumber(body.participationPercentage, 0, 100)
    || (body.dividendTaxation !== null && !isDividendTaxation(body.dividendTaxation))
    || !isProfitDistributionStatus(body.status)
    || typeof body.caseAside !== "boolean"
    || typeof body.observation !== "string" || body.observation.length > 5000) {
    return NextResponse.json({ error: "Confira os campos da empresa. Percentual deve estar entre 0 e 100, com até duas casas decimais." }, { status: 400 });
  }
  try {
    const company = await prisma.company.findFirst({ where: { cnpj: body.companyCnpj, deletedAt: null }, select: { cnpj: true } });
    if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    if (!await prisma.referenceYear.findUnique({ where: { year: body.year } })) {
      return NextResponse.json({ error: "Ano não cadastrado." }, { status: 400 });
    }
    const data = {
      participationPercentage: body.participationPercentage == null || body.participationPercentage === "" ? null : Number(body.participationPercentage),
      dividendTaxation: body.dividendTaxation,
      status: body.status,
      observation: body.observation.trim(),
      caseAside: body.caseAside,
    };
    const saved = await prisma.profitCompanySettings.upsert({
      where: { companyCnpj_referenceYear: { companyCnpj: body.companyCnpj, referenceYear: body.year } },
      create: { companyCnpj: body.companyCnpj, referenceYear: body.year, ...data },
      update: data,
    });
    revalidatePath("/dashboard/distribuicao-lucros");
    return NextResponse.json({ ...saved, participationPercentage: saved.participationPercentage == null ? null : Number(saved.participationPercentage), observation: saved.observation ?? "" });
  } catch (error) {
    console.error("Erro ao salvar configuração da distribuição", error);
    return NextResponse.json({ error: "Não foi possível salvar a empresa." }, { status: 500 });
  }
}
