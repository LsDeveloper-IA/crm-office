import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

function normalizeCnpj(value: string) {
  return value.replace(/\D/g, "");
}

// GET /api/profit-distributions?companyCnpj=...
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyCnpjParam = searchParams.get("companyCnpj");

  const companyCnpj = companyCnpjParam
    ? normalizeCnpj(companyCnpjParam)
    : undefined;

  try {
    const profitDistributions = await prisma.profitDistribution.findMany({
      where: companyCnpj
        ? {
            companyCnpj,
          }
        : undefined,
      include: {
        company: {
          select: {
            cnpj: true,
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
      partnerName: item.partnerName,
      participationPercentage: item.participationPercentage,
      amount: item.amount,
      status: item.status,
      observation: item.observation,
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
    const partnerName = String(body.partnerName ?? "").trim();
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

    if (!partnerName) {
      return NextResponse.json(
        { error: "Nome do sócio é obrigatório" },
        { status: 400 }
      );
    }

    if (
      participationPercentage === undefined ||
      participationPercentage === null ||
      Number.isNaN(Number(participationPercentage))
    ) {
      return NextResponse.json(
        { error: "Percentual de participação inválido" },
        { status: 400 } 
      );
    }

    if (
      amount === undefined ||
      amount === null ||
      Number.isNaN(Number(amount))
    ) {
      return NextResponse.json(
        { error: "Valor inválido" },
        { status: 400 }
      );
    }

    const company = await prisma.company.findUnique({
      where: {
        cnpj: companyCnpj,
      },
      select: {
        cnpj: true,
      },
    });

    if (!company) {
      return NextResponse.json(
        { error: "Empresa não encontrada" },
        { status: 404 }
      );
    }

    const created = await prisma.profitDistribution.create({    
      data: {
        companyCnpj,
        partnerName,
        participationPercentage: Number(participationPercentage),
        amount: Number(amount),
        observation,
        // status entra no default do Prisma: NAO_ENCERRADO
      },
      include: {
        company: {
          select: {
            cnpj: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao criar distribuição de lucro",
      },
      { status: 500 }
    );
  }
}