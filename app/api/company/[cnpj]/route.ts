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
          accountant: true,
          taxRegime: {
            select: {
              key: true,
              name: true,
            },
          },
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
          id: true,
          ownerName: true, // 🔒 legado
          sector: {
            select: {
              id: true,
              name: true,
            },
          },
          owners: {
            select: {
              id: true,
              name: true,
            },
          },
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

    taxRegime: company.profile?.taxRegime ?? undefined,
    accountant: company.profile?.accountant ?? undefined,

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
      companySectorId: cs.id,
      sectorId: String(cs.sector.id),
      sectorName: cs.sector.name,

      // legado
      ownerLegacy: cs.ownerName ?? undefined,

      // novo modelo
      owners: cs.owners.map((o) => ({
        id: o.id,
        name: o.name,
      })),
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
    /* ======================
        PROFILE
    ====================== */

    await tx.companyProfile.upsert({
      where: { companyCnpj: cnpj },
      update: { accountant },
      create: {
        companyCnpj: cnpj,
        accountant,
      },
    });

    if (taxRegime) {
      const exists = await tx.taxRegime.findUnique({
        where: { key: taxRegime },
        select: { id: true },
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
      await tx.companyProfile.update({
        where: { companyCnpj: cnpj },
        data: {
          taxRegime: { disconnect: true },
        },
      });
    }

    /* ======================
        SECTORS + OWNERS
    ====================== */

    if (!Array.isArray(companySectors)) return;

    const incomingSectorIds = companySectors
      .map((s: any) => s.companySectorId)
      .filter(Boolean);

    // 🔥 remove setores excluídos no front
    await tx.companySector.deleteMany({
      where: {
        companyCnpj: cnpj,
        id: { notIn: incomingSectorIds },
      },
    });

    for (const s of companySectors) {
      if (!s.sectorId || Number.isNaN(Number(s.sectorId))) continue;

      const owners =
        Array.isArray(s.owners)
          ? s.owners
              .map((o: any) => o.name?.trim())
              .filter(Boolean)
          : [];

      /* ======================
          UPSERT SECTOR
      ====================== */

      const sector = await tx.companySector.upsert({
        where: {
          id: s.companySectorId ?? "",
        },
        update: {
          sectorId: Number(s.sectorId),

          // 🔥 legado: apaga se não houver owners
          ownerName:
            owners.length > 0
              ? owners.join(", ")
              : null,
        },
        create: {
          companyCnpj: cnpj,
          sectorId: Number(s.sectorId),
          ownerName:
            owners.length > 0
              ? owners.join(", ")
              : null,
        },
      });

      /* ======================
          OWNERS (NOVO MODELO)
      ====================== */

      // 🔥 remove owners excluídos
      await tx.companySectorOwner.deleteMany({
        where: {
          companySectorId: sector.id,
          name: { notIn: owners },
        },
      });

      // 🔥 cria owners novos
      const existing = await tx.companySectorOwner.findMany({
        where: { companySectorId: sector.id },
        select: { name: true },
      });

      const existingNames = new Set(
        existing.map((o) => o.name)
      );

      const toCreate = owners.filter(
        (name: string) => !existingNames.has(name)
      );

      if (toCreate.length > 0) {
        await tx.companySectorOwner.createMany({
          data: toCreate.map((name: string) => ({
            companySectorId: sector.id,
            name,
          })),
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
