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
          paysFees: true,
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
    paysFees: company.profile?.paysFees ?? false,

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
  const { taxRegime, accountant, paysFees, companySectors } = body;

  await prisma.$transaction(async (tx) => {
    /* ======================
        PROFILE
    ====================== */

    await tx.companyProfile.upsert({
      where: { companyCnpj: cnpj },
      update: { accountant, paysFees: Boolean(paysFees) },
      create: {
        companyCnpj: cnpj,
        accountant,
        paysFees: Boolean(paysFees),
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

    // remove setores deletados no front
    await tx.companySector.deleteMany({
      where: {
        companyCnpj: cnpj,
        id: { notIn: incomingSectorIds },
      },
    });

    for (const s of companySectors) {
      if (!s.sectorId || Number.isNaN(Number(s.sectorId))) continue;

      const ownersPayload = Array.isArray(s.owners) ? s.owners : [];

      /* ======================
          CREATE / UPDATE SECTOR
      ====================== */

      const sector = s.companySectorId
        ? await tx.companySector.update({
            where: { id: s.companySectorId },
            data: {
              sectorId: Number(s.sectorId),
            },
          })
        : await tx.companySector.create({
            data: {
              companyCnpj: cnpj,
              sectorId: Number(s.sectorId),
            },
          });

      /* ======================
          OWNERS SYNC
      ====================== */

      const incomingOwnerIds = ownersPayload
        .map((o: any) => o.id)
        .filter(Boolean);

      // remove owners excluídos
      await tx.companySectorOwner.deleteMany({
        where: {
          companySectorId: sector.id,
          id: { notIn: incomingOwnerIds },
        },
      });

      // atualiza existentes
      for (const owner of ownersPayload) {
        if (owner.id) {
          await tx.companySectorOwner.update({
            where: { id: owner.id },
            data: {
              name: owner.name.trim(),
            },
          });
        }
      }

      // cria novos
      const toCreate = ownersPayload.filter(
        (o: any) => !o.id && o.name?.trim()
      );

      if (toCreate.length > 0) {
        await tx.companySectorOwner.createMany({
          data: toCreate.map((o: any) => ({
            companySectorId: sector.id,
            name: o.name.trim(),
          })),
        });
      }

      /* ======================
          LEGADO — ownerName
      ====================== */

      await tx.companySector.update({
        where: { id: sector.id },
        data: {
          ownerName: s.ownerLegacy?.trim() || null,
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
