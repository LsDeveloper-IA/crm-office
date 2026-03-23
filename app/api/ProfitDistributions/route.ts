import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

function normalizeCnpj(value: string) {
  return value.replace(/\D/g, "");
}

// GET /api/profit-distributions?companyCnpj=...
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const companyCnpjParam = searchParams.get("companyCnpj");
  const referenceDateParam = searchParams.get("referenceDate");

  const companyCnpj = companyCnpjParam
    ? normalizeCnpj(companyCnpjParam)
    : undefined;

  const referenceDate = referenceDateParam
    ? new Date(referenceDateParam)
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
      partnerName: item.partner.name, // 🔥 vem da relation

      participationPercentage: item.participationPercentage,
      amount: item.amount,
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

// POST /api/profit-distributions
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const companyCnpj = normalizeCnpj(body.companyCnpj ?? "");
    const partnerId = Number(body.partnerId);
    const referenceDate = body.referenceDate
      ? new Date(body.referenceDate)
      : null;

    const participationPercentage = body.participationPercentage;
    const amount = body.amount;

    const observation =
      body.observation && String(body.observation).trim() !== ""
        ? String(body.observation).trim()
        : null;

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

    const result = await prisma.profitDistribution.upsert({
      where: {
        companyCnpj_partnerId_referenceDate: {
          companyCnpj,
          partnerId,
          referenceDate,
        },
      },
      update: {
        participationPercentage: Number(participationPercentage),
        amount: Number(amount),
        observation,
      },
      create: {
        companyCnpj,
        partnerId,
        referenceDate,
        participationPercentage: Number(participationPercentage),
        amount: Number(amount),
        observation,
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