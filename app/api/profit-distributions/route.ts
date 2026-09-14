import { requireDistributionUser } from "@/lib/profit-distribution-auth";
import { isValidDistributionNumber } from "@/lib/profit-distribution-input";
import { isDividendTaxation } from "@/lib/dividend-taxation";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma, ProfitDistributionStatus } from "@prisma/client";
import { sendProfitDistributionEmail } from "@/lib/email";
import { getProfitDistributionStatusOrNull } from "@/lib/profit-distribution-status";
import { revalidatePath } from "next/cache";

function normalizeCnpj(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

/* =========================
   GET
========================= */
export async function GET(request: NextRequest) {
  const denied = await requireDistributionUser();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);

  const companyCnpjParam = searchParams.get("companyCnpj");
  const referenceDateParam = searchParams.get("referenceDate");
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");
  const referenceMonth = monthParam == null ? undefined : Number(monthParam);
  if (referenceMonth !== undefined && (!Number.isInteger(referenceMonth) || referenceMonth < 1 || referenceMonth > 12)) {
    return NextResponse.json({ error: "Mês de referência inválido" }, { status: 400 });
  }
  const referenceYear = yearParam == null ? undefined : Number(yearParam);
  if (referenceYear !== undefined && (!Number.isInteger(referenceYear) || referenceYear < 2025 || referenceYear > 9999)) {
    return NextResponse.json({ error: "Ano de referência inválido" }, { status: 400 });
  }

  const companyCnpj = companyCnpjParam
    ? normalizeCnpj(companyCnpjParam)
    : undefined;

  const referenceDate = referenceDateParam
    ? new Date(referenceDateParam)
    : undefined;
  if (referenceDate && Number.isNaN(referenceDate.getTime())) {
    return NextResponse.json({ error: "Data de alteração inválida" }, { status: 400 });
  }

  try {
    const profitDistributions = await prisma.profitDistribution.findMany({
      where: {
        ...(companyCnpj ? { companyCnpj } : {}),
        ...(referenceYear !== undefined ? { referenceYear } : {}),
        ...(referenceMonth !== undefined ? { referenceMonth } : {}),
        ...(referenceDate ? { referenceDate } : {}),
      },
      include: {
        company: {
          select: {
            cnpj: true,
            name: true,
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        id: "desc",
      },
    });

    const resultado = profitDistributions.map((item) => ({
      id: item.id,
      companyCnpj: item.companyCnpj,
      companyName: item.company?.name ?? null,

      partnerId: item.partnerId,
      partnerName: item.partner?.name ?? null,

      participationPercentage: item.participationPercentage == null ? null : Number(item.participationPercentage),
      dividendTaxation: item.dividendTaxation,
      amount: item.amount == null ? null : Number(item.amount),
      status: item.status,
      observation: item.observation,
      referenceDate: item.referenceDate,
      referenceYear: item.referenceYear,
      referenceMonth: item.referenceMonth,
    }));

    return NextResponse.json(resultado);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao buscar distribuições de lucro",
      },
      { status: 500 }
    );
  }
}

/* =========================
   POST (UPSERT)
========================= */
export async function POST(request: NextRequest) {
  const denied = await requireDistributionUser();
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Corpo da requisicao invalido" }, { status: 400 });
    }

    const companyCnpj = normalizeCnpj(body.companyCnpj ?? "");
    const partnerId = Number(body.partnerId);

    const referenceMonth = body.month;
    const referenceYear = body.year;
    if (!Number.isInteger(referenceMonth) || referenceMonth < 1 || referenceMonth > 12
      || !Number.isInteger(referenceYear) || referenceYear < 2025 || referenceYear > 9999) {
      return NextResponse.json({ error: "Mês e ano de referência são obrigatórios e devem ser válidos" }, { status: 400 });
    }

    if (body.dividendTaxation != null && !isDividendTaxation(body.dividendTaxation)) {
      return NextResponse.json({ error: "Tributação de dividendos inválida" }, { status: 400 });
    }
    const dividendTaxation = body.dividendTaxation;
    if (!isValidDistributionNumber(body.participationPercentage, 0, 100)) {
      return NextResponse.json({ error: "Percentual deve estar entre 0 e 100, com até duas casas decimais" }, { status: 400 });
    }
    if (!isValidDistributionNumber(body.amount, -9999999999999.99, 9999999999999.99)) {
      return NextResponse.json({ error: "Valor inválido: informe um número com até duas casas decimais" }, { status: 400 });
    }
    const participationPercentage = body.participationPercentage == null || body.participationPercentage === "" ? null : Number(body.participationPercentage);
    const amount = body.amount == null || body.amount === "" ? null : Number(body.amount);

    const status =
      body.status == null
        ? ProfitDistributionStatus.NAO_ENCERRADO
        : getProfitDistributionStatusOrNull(body.status);

    const observation =
      body.observation && String(body.observation).trim() !== ""
        ? String(body.observation).trim()
        : null;

    /* =====================
       ✅ VALIDAÇÕES
    ===================== */

    if (!companyCnpj || companyCnpj.length !== 14) {
      return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });
    }

    if (!Number.isSafeInteger(partnerId) || partnerId <= 0) {
      return NextResponse.json({ error: "Sócio inválido" }, { status: 400 });
    }

    if (!await prisma.referenceYear.findUnique({ where: { year: referenceYear } })) {
      return NextResponse.json({ error: "Ano de referência não cadastrado" }, { status: 400 });
    }

    if (Number.isNaN(participationPercentage)) {
      return NextResponse.json(
        { error: "Percentual inválido" },
        { status: 400 }
      );
    }

    if (Number.isNaN(amount)) {
      return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    }

    if (!status) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }

    if (!await prisma.profitPartner.findFirst({ where: { id: partnerId, companyCnpj }, select: { id: true } })) {
      return NextResponse.json({ error: "Sócio não pertence à empresa selecionada" }, { status: 400 });
    }

    /* =====================
       🔍 BUSCA REGISTRO ANTIGO
    ===================== */

    const { existing, result } = await prisma.$transaction(async (tx) => {
      // Serialize saves for the same company/partner/month/year, including first saves.
      const periodKey = `${companyCnpj}:${partnerId}:${referenceYear}:${referenceMonth}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${periodKey}, 0))`;
      const existing = await tx.profitDistribution.findFirst({
        where: { companyCnpj, partnerId, referenceYear, referenceMonth },
        orderBy: { id: "desc" },
      });
      const data = {
        participationPercentage: participationPercentage == null ? null : new Prisma.Decimal(participationPercentage),
        dividendTaxation,
        amount: amount == null ? null : new Prisma.Decimal(amount),
        observation,
        status,
        referenceDate: new Date(),
      };
      const include = { company: true, partner: true } as const;
      const result = existing
        ? await tx.profitDistribution.update({ where: { id: existing.id }, data, include })
        : await tx.profitDistribution.create({
          data: { companyCnpj, partnerId, referenceYear, referenceMonth, ...data }, include,
        });
      return { existing, result };
    });

    /* =====================
       📩 EMAIL (SÓ SE MUDOU)
    ===================== */

    const oldStatus = existing?.status;

    const virouEncerrado =
      status === ProfitDistributionStatus.ENCERRADO_COM_LUCRO ||
      status === ProfitDistributionStatus.ENCERRADO_COM_PREJUIZO;

    const mudouStatus = oldStatus !== status;

    if (virouEncerrado && mudouStatus) {
      try {
        await sendProfitDistributionEmail({
          companyName: result.company.name ?? "-",
          companyCnpj: result.companyCnpj,
          partnerName: result.partner.name,
          status: result.status,
          amount: Number(result.amount),
        });
      } catch (error) {
        console.error("Profit distribution saved, but email notification failed:", error);
      }
    }

    /* =====================
       🔥 REVALIDA CACHE (ESSENCIAL)
    ===================== */

    revalidatePath("/dashboard/distribuicao-lucros");

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao salvar distribuição de lucro",
      },
      { status: 500 }
    );
  }
}
