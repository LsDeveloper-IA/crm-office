import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { normalizeCNPJ, isValidCNPJ } from "@/lib/cnpj";
import { getOrCreateCompanyByCnpj } from "@/lib/company/company.create";

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

    /**
     * 🔹 1. RECEITA / SEFAZ
     */
    const company = await getOrCreateCompanyByCnpj(cnpj);

    /**
     * 🔹 2. PERFIL (regime + contador)
     */
    await prisma.companyProfile.upsert({
      where: { companyCnpj: cnpj },
      update: {
        taxRegime: body.taxRegime,
        accountant: body.accountant,
      },
      create: {
        companyCnpj: cnpj,
        taxRegime: body.taxRegime,
        accountant: body.accountant,
      },
    });

    /**
     * 🔹 3. SETORES (múltiplos)
     */
    if (Array.isArray(body.companySectors)) {
      await prisma.companySector.deleteMany({
        where: { companyCnpj: cnpj },
      });

      await prisma.companySector.createMany({
        data: body.companySectors.map((s: any) => ({
          companyCnpj: cnpj,
          sectorId: Number(s.sectorId),
          ownerName: null,
        })),
      });
    }

    /**
     * 🔹 4. CONTATO (opcional)
     */
    if (body.email || body.phone) {
      // opcional: remover contatos antigos
      await prisma.contact.deleteMany({
        where: { companyCnpj: cnpj },
      });

      await prisma.contact.create({
        data: {
          companyCnpj: cnpj,
          firstName: "Contato principal",
          email: body.email,
          phone: body.phone,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Erro interno" },
      { status: 500 }
    );
  }
}