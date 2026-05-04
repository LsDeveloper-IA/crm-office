import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { sendProfitDistributionEmail } from "@/lib/email";
import { getProfitDistributionStatusOrNull } from "@/lib/profit-distribution-status";
import { ProfitDistributionStatus } from "@prisma/client";

function normalizeCnpj(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/* =========================
   GET
========================= */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const companyCnpjParam = searchParams.get("companyCnpj");
  const referenceDateParam = searchParams.get("referenceDate");

  const companyCnpj = companyCnpjParam
    ? normalizeCnpj(companyCnpjParam)
    : undefined;

  const referenceDate = referenceDateParam
    ? normalizeDate(new Date(referenceDateParam))
    : undefined;

  try {
    const profitDistributions = await prisma.profitDistribution.findMany({
      where: {
        ...(companyCnpj ? { companyCnpj } : {}),
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

      participationPercentage: Number(item.participationPercentage),
      amount: Number(item.amount),
      status: item.status,
      observation: item.observation,
      referenceDate: item.referenceDate,
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
  try {
    const body = await request.json();

    const companyCnpj = normalizeCnpj(body.companyCnpj ?? "");
    const partnerId = Number(body.partnerId);

    const referenceDate = body.referenceDate
      ? normalizeDate(new Date(body.referenceDate))
      : null;

    const participationPercentage = Number(body.participationPercentage);
    const amount = Number(body.amount);

    const status =
      body.status == null
        ? ProfitDistributionStatus.NAO_ENCERRADO
        : getProfitDistributionStatusOrNull(body.status);

    const observation =
      body.observation && String(body.observation).trim() !== ""
        ? String(body.observation).trim()
        : null;

    /* =====================
       ✅ VALIDAÇÕES ANTES
    ===================== */

    if (!companyCnpj || companyCnpj.length !== 14) {
      return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });
    }

    if (!partnerId || Number.isNaN(partnerId)) {
      return NextResponse.json({ error: "Sócio inválido" }, { status: 400 });
    }

    if (!referenceDate) {
      return NextResponse.json(
        { error: "Data de referência é obrigatória" },
        { status: 400 }
      );
    }

    if (Number.isNaN(participationPercentage)) {
      return NextResponse.json({ error: "Percentual inválido" }, { status: 400 });
    }

    if (Number.isNaN(amount)) {
      return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    }

    if (!status) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }

    /* =====================
       🔍 BUSCA REGISTRO ANTIGO
    ===================== */

    const existing = await prisma.profitDistribution.findUnique({
      where: {
        companyCnpj_partnerId_referenceDate: {
          companyCnpj,
          partnerId,
          referenceDate,
        },
      },
    });

    /* =====================
       💾 UPSERT
    ===================== */

    const result = await prisma.profitDistribution.upsert({
      where: {
        companyCnpj_partnerId_referenceDate: {
          companyCnpj,
          partnerId,
          referenceDate,
        },
      },
      update: {
        participationPercentage: new Prisma.Decimal(participationPercentage),
        amount: new Prisma.Decimal(amount),
        observation,
        status,
      },
      create: {
        companyCnpj,
        partnerId,
        referenceDate,
        participationPercentage: new Prisma.Decimal(participationPercentage),
        amount: new Prisma.Decimal(amount),
        observation,
        status,
      },
      include: {
        company: true,
        partner: true,
      },
    });

    /* =====================
       📩 EMAIL INTELIGENTE
    ===================== */

    const oldStatus = existing?.status;

    const virouEncerrado =
      status === ProfitDistributionStatus.ENCERRADO_COM_LUCRO ||
      status === ProfitDistributionStatus.ENCERRADO_COM_PREJUIZO;

    const mudouStatus = oldStatus !== status;

    if (virouEncerrado && mudouStatus) {
      await sendProfitDistributionEmail({
        companyName: result.company.name ?? "-",
        companyCnpj: result.companyCnpj,
        partnerName: result.partner.name,
        status: result.status,
        amount: Number(result.amount),
      });
    }

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