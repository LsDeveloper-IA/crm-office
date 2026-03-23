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

    // 🔥 evita duplicados entre Receita e banco
    const dbNames = new Set(
      partnersDb.map((p) => p.name.trim().toLowerCase())
    );

    const partners = [
      // ✅ parceiros do banco
      ...partnersDb.map((p) => ({
        id: p.id,
        name: p.name,
        source: "db" as const,
      })),

      // ⚠️ fallback Receita (somente se não existir no DB)
      ...qsas
        .filter(
          (q) => !dbNames.has(q.nome.trim().toLowerCase())
        )
        .map((q, index) => ({
          id: -(index + 1), // evita id 0
          name: q.nome,
          source: "receita" as const,
        })),
    ];

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

// POST /api/profit-distributions/partners
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

    // 🔥 evita duplicado
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