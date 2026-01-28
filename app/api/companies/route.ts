import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { normalizeCNPJ, isValidCNPJ } from "@/lib/cnpj";
import type { Prisma } from "@prisma/client";

type CompanySectorInput = {
  sectorId?: number | string | null;
  owner?: string | null;
};

type CompanyPayload = {
  cnpj: string;
  name?: string | null;
  accountant?: string | null;
  taxRegime?: string | null;
  companySectors?: CompanySectorInput[] | null;
};


// GET /api/companies?q=...&limit=12
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(Number(searchParams.get("limit") ?? 12), 20);

    if (!q) {
      return NextResponse.json({ items: [] });
    }

    // normaliza para buscar CNPJ por dígitos também
    const qDigits = q.replace(/\D/g, "");

    const items = await prisma.company.findMany({
      take: limit,
      orderBy: { name: "asc" },
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          ...(qDigits
            ? [{ cnpj: { contains: qDigits } }]
            : []),
        ],
      },
      select: {
        cnpj: true,
        name: true,
      },
    });

    return NextResponse.json({ items });
  } catch (err: unknown) {
    console.error("GET /api/companies ERROR:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// POST /api/companies
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CompanyPayload;
    const cnpj = normalizeCNPJ(body.cnpj);

    if (!isValidCNPJ(cnpj)) {
      return NextResponse.json(
        { error: "CNPJ inválido" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 1️⃣ cria ou garante empresa
      await tx.company.upsert({
        where: { cnpj },
        update: {},
        create: {
          cnpj,
          name: body.name ?? "Empresa sem nome",
        },
      });

      // 2️⃣ cria/atualiza profile SEM taxRegime
      await tx.companyProfile.upsert({
        where: { companyCnpj: cnpj },
        update: {
          accountant: body.accountant,
        },
        create: {
          companyCnpj: cnpj,
          accountant: body.accountant,
        },
      });

      // 3️⃣ conecta regime (se existir)
      if (body.taxRegime) {
        const regime = await tx.taxRegime.findUnique({
          where: { key: body.taxRegime },
          select: { id: true },
        });

        if (!regime) {
          throw new Error("Regime tributário inválido");
        }

        await tx.companyProfile.update({
          where: { companyCnpj: cnpj },
          data: {
            taxRegime: {
              connect: { key: body.taxRegime },
            },
          },
        });
      }

      // 4️⃣ setores
      if (Array.isArray(body.companySectors)) {
        await tx.companySector.createMany({
          data: body.companySectors
            .filter((s) => s.sectorId !== null && s.sectorId !== undefined)
            .map((s) => ({
              companyCnpj: cnpj,
              sectorId: Number(s.sectorId),
              ownerName: s.owner || null,
            })),
          skipDuplicates: true,
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("POST /api/companies ERROR:", err);
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
