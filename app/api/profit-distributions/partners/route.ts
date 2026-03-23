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
    const [qsas, partnersDb] = await Promise.all([
      prisma.companyQsa.findMany({
        where: { companyCnpj },
        select: { nome: true },
        orderBy: { nome: "asc" },
      }),

      prisma.profitPartner.findMany({
        where: { companyCnpj },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
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
      partners: [
        ...partnersDb.map((p) => ({
          id: p.id,
          name: p.name,
          source: "db",
        })),
        ...qsas.map((q, index) => ({
          id: -index, // fallback
          name: q.nome,
          source: "receita",
        })),
      ],
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const companyCnpj = normalizeCnpj(body.companyCnpj ?? "");
    const name = String(body.name ?? "").trim();

    if (!companyCnpj || companyCnpj.length !== 14) {
      return NextResponse.json(
        { error: "CNPJ inválido" },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { error: "Nome do sócio é obrigatório" },
        { status: 400 }
      );
    }

    // evita duplicado
    const existing = await prisma.profitPartner.findFirst({
      where: {
        companyCnpj,
        name,
      },
    });

    if (existing) return NextResponse.json(existing);

    const partner = await prisma.profitPartner.create({
      data: {
        companyCnpj,
        name,
      },
    });

    return NextResponse.json(partner, { status: 201 });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message ?? "Erro ao criar sócio" },
      { status: 500 }
    );
  }
}