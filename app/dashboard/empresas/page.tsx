export const dynamic = "force-dynamic";

import Card from "./components/card";
import { CompanyTable } from "./components/CompanyTable";
import prisma from "@/lib/prisma";
import { mapCompanyToRowDTO } from "./dto/mapper";
import type { Prisma } from "@prisma/client";

type Props = {
  searchParams: Promise<{
    page?: string;
    sort?: string;
    dir?: "asc" | "desc";
    group?: string;
  }>;
};

const PAGE_SIZE = 13;

// 🔒 mapa seguro de ordenação
const SORT_MAP: Record<string, Prisma.CompanyOrderByWithRelationInput> = {
  name: { name: "asc" },
  cnpj: { cnpj: "asc" },

  paysFees: {
    profile: {
      paysFees: "asc",
    },
  },

  taxRegime: {
    profile: {
      taxRegime: {
        name: "asc",
      },
    },
  },

  accountant: {
    profile: {
      accountant: "asc",
    },
  },
};


export default async function Company({ searchParams }: Props) {
  const params = await searchParams;

  const page = Math.max(Number(params.page) || 1, 1);
  const skip = (page - 1) * PAGE_SIZE;

  const sortKey = params.sort ?? "name";
  const dir = params.dir === "desc" ? "desc" : "asc";

  // 🛡️ fallback seguro
  const baseOrder = SORT_MAP[sortKey] ?? SORT_MAP.name;

  // 🔁 aplica direção (asc/desc) corretamente
  const orderBy = JSON.parse(
    JSON.stringify(baseOrder).replace(/"asc"/g, `"${dir}"`)
  );

  const where: Prisma.CompanyWhereInput = params.group
    ? {
        profile: {
          is: {
            group: params.group,
          },
        },
      }
    : {};

  const [companiesRaw, total, totalSimples, totalNaoSimples, totalPagantes] = await Promise.all([
    prisma.company.findMany({
      where,
      orderBy,
      skip,
      take: PAGE_SIZE,
      select: {
        cnpj: true,
        name: true,
        profile: {
          select: {
            taxRegime: true,
            accountant: true,
            paysFees: true,
            group: true,
          },
        },
      },
    }),

    prisma.company.count(),

    prisma.company.count({
      where: { profile: { is: { taxRegime: { key: "SIMPLES" } } } },
    }),

    prisma.company.count({
      where: {
        OR: [
          { profile: null },
          { profile: { is: { taxRegime: null } } },
          { profile: { is: { taxRegime: { key: { not: "SIMPLES" } } } } },
        ],
      },
    }),

    prisma.company.count({
      where: {
        profile: {
          is: {
            paysFees: true,
          },
        },
      },
    }),
  ]);

  const companies = companiesRaw.map(mapCompanyToRowDTO);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="flex flex-col gap-7 flex-1 min-h-0">
      {/* Cards */}
      <div className="w-full h-24 flex items-center gap-4 justify-between">
        <Card title="Total de empresas" value={total} />
        <Card title="Total Honorários" value={totalPagantes} />
        <Card title="Card 3" value="-" />
        <Card title="Simples Nacional"
          valueLeft={totalSimples}
          subtitleLeft="Optantes"
          valueRight={totalNaoSimples}
          subtitleRight="Não optantes" />
      </div>

      {/* Tabela */}
      <div className="flex-1 bg-white rounded-lg p-7 overflow-auto min-h-0 shadow-2xl">
        <CompanyTable
          companies={companies}
          page={page}
          totalPages={totalPages}
        />
      </div>
    </main>
  );
}
