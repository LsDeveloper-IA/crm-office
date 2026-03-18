import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

function normalizeCnpj(value: string) {
  return value.replace(/\D/g, "");
}

// GET /api/profit-distributions/partners?companyCnpj=...
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyCnpjParam = searchParams.get("companyCnpj");

  if (!companyCnpjParam) {
    return NextResponse.json(
      { error: "companyCnpj é obrigatório" },
      { status: 400 }
    );
  }

  const companyCnpj = normalizeCnpj(companyCnpjParam);

  if (companyCnpj.length !== 14) {
    return NextResponse.json(
      { error: "CNPJ inválido" },
      { status: 400 }
    );
  }

  try {
    const [qsas, oldPartners] = await Promise.all([
      prisma.companyQsa.findMany({
        where: {
          companyCnpj,
        },
        select: {
          nome: true,
        },
        orderBy: {
          nome: "asc",
        },
      }),
      prisma.profitDistribution.findMany({
        where: {
          companyCnpj,
        },
        select: {
          partnerName: true,
        },
        orderBy: {
          partnerName: "asc",
        },
      }),
    ]);

    const partners = Array.from(
      new Set([
        ...qsas.map((item) => item.nome.trim()),
        ...oldPartners.map((item) => item.partnerName.trim()),
      ].filter(Boolean))
    );

    return NextResponse.json({
      companyCnpj,
      partners,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao buscar sócios",
      },
      { status: 500 }
    );
  }
}