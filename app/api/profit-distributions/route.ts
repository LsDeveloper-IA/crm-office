import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

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

    const participationPercentage = body.participationPercentage;
    const amount = body.amount;

    const status = body.status ?? "NAO_ENCERRADO";

    const observation =
      body.observation && String(body.observation).trim() !== ""
        ? String(body.observation).trim()
        : null;

    /* =====================
       VALIDAÇÕES
    ===================== */

    if (!companyCnpj || companyCnpj.length !== 14) {
      return NextResponse.json(
        { error: "CNPJ inválido" },
        { status: 400 }
      );
    }

    if (!partnerId || Number.isNaN(partnerId)) {
      return NextResponse.json(
        { error: "Sócio inválido" },
        { status: 400 }
      );
    }

    if (!referenceDate) {
      return NextResponse.json(
        { error: "Data de referência é obrigatória" },
        { status: 400 }
      );
    }

    if (Number.isNaN(Number(participationPercentage))) {
      return NextResponse.json(
        { error: "Percentual inválido" },
        { status: 400 }
      );
    }

    if (Number.isNaN(Number(amount))) {
      return NextResponse.json(
        { error: "Valor inválido" },
        { status: 400 }
      );
    }

    const allowedStatus = [
      "NAO_ENCERRADO",
      "ENCERRADO_COM_LUCRO",
      "ENCERRADO_COM_PREJUIZO",
    ];

    if (!allowedStatus.includes(status)) {
      return NextResponse.json(
        { error: "Status inválido" },
        { status: 400 }
      );
    }

    /* =====================
       VALIDA EXISTÊNCIA
    ===================== */

    const partner = await prisma.profitPartner.findUnique({
      where: { id: partnerId },
    });

    if (!partner) {
      return NextResponse.json(
        { error: "Sócio não encontrado" },
        { status: 404 }
      );
    }

    /* =====================
       UPSERT
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
    });

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