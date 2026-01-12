import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type Params = {
  params: Promise<{
    cnpj: string;
  }>;
};

/* =========================
    GET — Buscar empresa
========================= */
export async function GET(_: Request, { params }: Params) {
  const { cnpj: rawCnpj } = await params;
  const cnpj = rawCnpj.replace(/\D/g, "");

  if (!cnpj || cnpj.length !== 14) {
    return NextResponse.json(
      { error: "CNPJ inválido" },
      { status: 400 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { cnpj },
    select: {
      cnpj: true,
      name: true,

      profile: {
        select: {
          taxRegime: true,
          accountant: true,
        },
      },

      publicSpace: true,
      number: true,
      district: true,
      city: true,
      state: true,

      qsas: {
        select: {
          nome: true,
          qualificacao: true,
        },
      },

      activities: {
        select: {
          cnaeCode: true,
          description: true,
          kind: true,
        },
      },

      companySectors: {
        select: {
          sector: { select: { name: true } },
          owner: { select: { username: true } },
        },
      },
    },
  });

  if (!company) {
    return NextResponse.json(
      { error: "Empresa não encontrada" },
      { status: 404 }
    );
  }

  return NextResponse.json(company);
}

/* =========================
    PATCH — Editar empresa
========================= */
export async function PATCH(
  req: Request,
  { params }: Params
) {
  const { cnpj: rawCnpj } = await params;
  const cnpj = rawCnpj.replace(/\D/g, "");

  if (!cnpj || cnpj.length !== 14) {
    return NextResponse.json(
      { error: "CNPJ inválido" },
      { status: 400 }
    );
  }

  const body = await req.json();

  const {
    taxRegime,
    accountant,
    companySectors,
  } = body;

  await prisma.$transaction(async (tx) => {
    // 🔹 Atualiza perfil (regime + contador)
    await tx.companyProfile.upsert({
      where: { companyCnpj: cnpj },
      update: {
        taxRegime,
        accountant,
      },
      create: {
        companyCnpj: cnpj,
        taxRegime,
        accountant,
      },
    });

    // 🔹 Atualiza setores (se enviados)
    if (Array.isArray(companySectors)) {
      await tx.companySector.deleteMany({
        where: { companyCnpj: cnpj },
      });

      await tx.companySector.createMany({
        data: companySectors.map((s: any) => ({
          companyCnpj: cnpj,
          sectorId: s.sectorId,
          ownerId: s.ownerId ?? null,
        })),
      });
    }
  });

  return NextResponse.json({ ok: true });
}