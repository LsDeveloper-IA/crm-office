import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type Params = {
  params: Promise<{
    cnpj: string;
  }>;
};

type CompanySectorOwnerInput = {
  id?: string | number | null;
  name?: string | null;
};

type CompanySectorInput = {
  companySectorId?: string | number | null;
  sectorId?: string | number | null;
  owners?: CompanySectorOwnerInput[] | null;
  ownerLegacy?: string | null;
};

type PatchBody = {
  taxRegime?: string | null;
  accountant?: string | null;
  paysFees?: boolean | null;
  companySectors?: CompanySectorInput[] | null;
  group?: string | null;
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
          feesType: true,
          feesValue: true,
          group: true,
          paysSystem: true,
          systemName: true,
          systemValue: true,
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
    feesType: company.profile?.feesType ?? undefined,
    feesValue: company.profile?.feesValue ?? undefined,
    group: company.profile?.group ?? undefined,
    paysSystem: company.profile?.paysSystem ?? false,
    systemName: company.profile?.systemName ?? undefined,
    systemValue: company.profile?.systemValue ?? undefined,

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
  const {
    taxRegime,
    accountant,

    paysFees,
    feesType,
    feesValue,

    paysSystem,
    systemName,
    systemValue,

    group,

    companySectors,
  } = body;

  await prisma.$transaction(async (tx) => {
    /* ======================
        PROFILE
    ====================== */

  await tx.companyProfile.upsert({
    where: { companyCnpj: cnpj },

    update: {
      accountant,

      // HONORÁRIOS
      paysFees: Boolean(paysFees),
      feesType: paysFees ? feesType ?? null : null,
      feesValue: paysFees ? feesValue ?? null : null,

      // SISTEMA
      paysSystem: Boolean(paysSystem),
      systemName: paysSystem ? systemName?.trim() || null : null,
      systemValue: paysSystem ? systemValue ?? null : null,

      // GRUPO
      group: group ?? null,
    },

    create: {
      companyCnpj: cnpj,
      accountant,

      // HONORÁRIOS
      paysFees: Boolean(paysFees),
      feesType: paysFees ? feesType ?? null : null,
      feesValue: paysFees ? feesValue ?? null : null,

      // SISTEMA
      paysSystem: Boolean(paysSystem),
      systemName: paysSystem ? systemName?.trim() || null : null,
      systemValue: paysSystem ? systemValue ?? null : null,

      //GRUPO
      group: group ?? null,
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
      .map((s) =>
        s.companySectorId === null || s.companySectorId === undefined
          ? null
          : Number(s.companySectorId)
      )
      .filter((id): id is number => Number.isFinite(id));

    // remove setores deletados no front
    await tx.companySector.deleteMany({
      where: {
        companyCnpj: cnpj,
        id: { notIn: incomingSectorIds },
      },
    });

    for (const s of companySectors) {
      if (!s.sectorId || Number.isNaN(Number(s.sectorId))) continue;

      const ownersPayload: CompanySectorOwnerInput[] = Array.isArray(s.owners)
        ? s.owners
        : [];

      /* ======================
          CREATE / UPDATE SECTOR
      ====================== */

      const sectorId =
        s.companySectorId === null || s.companySectorId === undefined
          ? null
          : Number(s.companySectorId);

      const sector = Number.isFinite(sectorId)
        ? await tx.companySector.update({
            where: { id: Number(sectorId) },
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
        .map((o) =>
          o.id === null || o.id === undefined ? null : Number(o.id)
        )
        .filter((id): id is number => Number.isFinite(id));

      // remove owners excluídos
      await tx.companySectorOwner.deleteMany({
        where: {
          companySectorId: sector.id,
          id: { notIn: incomingOwnerIds },
        },
      });

      // atualiza existentes
      for (const owner of ownersPayload) {
        const ownerId =
          owner.id === null || owner.id === undefined
            ? null
            : Number(owner.id);

        if (Number.isFinite(ownerId)) {
          await tx.companySectorOwner.update({
            where: { id: Number(ownerId) },
            data: {
              name: owner.name?.trim() ?? "",
            },
          });
        }
      }

      // cria novos
      const toCreate = ownersPayload.filter(
        (o) => !o.id && o.name?.trim()
      );

      if (toCreate.length > 0) {
        await tx.companySectorOwner.createMany({
          data: toCreate.map((o) => ({
            companySectorId: sector.id,
            name: o.name?.trim() ?? "",
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
