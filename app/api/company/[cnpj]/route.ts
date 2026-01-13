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
          sector: {
            select: {
              id: true,
              name: true,
            },
          },
          ownerName: true, // ✅ APENAS TEXTO
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

  return NextResponse.json({
    cnpj: company.cnpj,
    name: company.name,

    taxRegime: company.profile?.taxRegime
      ? {
          key: company.profile.taxRegime.key,
          name: company.profile.taxRegime.name,
        }
      : undefined,

    accountant: company.profile?.accountant,

    address: {
      publicSpace: company.publicSpace,
      number: company.number,
      district: company.district,
      city: company.city,
      state: company.state,
    },

    qsas: company.qsas,
    activities: company.activities,

    companySectors: company.companySectors.map((cs) => ({
      sectorId: String(cs.sector.id),
      sectorName: cs.sector.name,
      owner: cs.ownerName ?? undefined,
    })),
  });
}

/* =========================
    PATCH — Editar empresa
========================= */
export async function PATCH(req: Request, { params }: Params) {
  const { cnpj: rawCnpj } = await params;
  const cnpj = rawCnpj.replace(/\D/g, "");

  if (!cnpj || cnpj.length !== 14) {
    return NextResponse.json(
      { error: "CNPJ inválido" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const { taxRegime, accountant, companySectors } = body;

  await prisma.$transaction(async (tx) => {
    // 🔹 upsert do profile SEM taxRegime
    await tx.companyProfile.upsert({
      where: { companyCnpj: cnpj },
      update: {
        accountant,
      },
      create: {
        companyCnpj: cnpj,
        accountant,
      },
    });

    // 🔹 agora trata o regime separadamente
    if (taxRegime) {
      const exists = await tx.taxRegime.findUnique({
        where: { key: taxRegime },
        select: { key: true },
      });

      if (!exists) {
        throw new Error("Regime tributário inválido");
      }

      await tx.companyProfile.update({
        where: { companyCnpj: cnpj },
        data: {
          taxRegime: {
            connect: { key: taxRegime },
          },
        },
      });
    } else {
      // remove regime
      await tx.companyProfile.update({
        where: { companyCnpj: cnpj },
        data: {
          taxRegime: {
            disconnect: true,
          },
        },
      });
    }

    // 🔹 setores
    if (Array.isArray(companySectors)) {
      await tx.companySector.deleteMany({
        where: { companyCnpj: cnpj },
      });

      const cleanSectors = Array.isArray(companySectors)
        ? companySectors.filter(
            (s: any) =>
              s.sectorId &&
              !Number.isNaN(Number(s.sectorId))
          )
        : [];

      await tx.companySector.createMany({
        data: cleanSectors.map((s: any) => ({
          companyCnpj: cnpj,
          sectorId: Number(s.sectorId),
          ownerName: s.owner?.trim() || null,
        })),
      });
    }
  });

  return NextResponse.json({ ok: true });
}