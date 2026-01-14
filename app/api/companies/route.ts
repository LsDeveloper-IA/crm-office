import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { normalizeCNPJ, isValidCNPJ } from "@/lib/cnpj";
import { getOrCreateCompanyByCnpj } from "@/lib/company/company.create";

// POST /api/companies
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cnpj = normalizeCNPJ(body.cnpj);

    if (!isValidCNPJ(cnpj)) {
      return NextResponse.json(
        { error: "CNPJ inválido" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
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
            .filter((s: any) => s.sectorId)
            .map((s: any) => ({
              companyCnpj: cnpj,
              sectorId: Number(s.sectorId),
              ownerName: s.owner || null,
            })),
          skipDuplicates: true,
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("POST /api/companies ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Erro interno" },
      { status: 500 }
    );
  }
}