export const dynamic = "force-dynamic";

import Card from "./components/card";
import { CompanyTable } from "./components/CompanyTable";
import prisma from "@/lib/prisma";
import { mapCompanyToRowDTO } from "./dto/mapper";

type Props = {
  searchParams: Promise<{
    page?: string;
  }>;
};

const PAGE_SIZE = 13;

export default async function Company({ searchParams }: Props) {
  const params = await searchParams;

  const page = Math.max(Number(params.page) || 1, 1);
  const skip = (page - 1) * PAGE_SIZE;

  const [companiesRaw, total, totalPagantes] = await Promise.all([
    prisma.company.findMany({
      orderBy: { name: "asc" },
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
          },
        },
      },
    }),
    prisma.company.count(),
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
        <Card title="Total de empresas" value={total}/>
        <Card title="Total Honorários" value={totalPagantes}/>
        <Card title="Card 3" value="-" />
        <Card title="Card 4" value="-" />
        <Card title="Card 5" value="-" />
      </div>

      {/* Tabela */}
      <div className="flex-1 bg-white rounded-lg p-7 overflow-auto min-h-0 shadow-2xl">
        <CompanyTable companies={companies} page={page} totalPages={totalPages} />
      </div>
    </main>
  );
}