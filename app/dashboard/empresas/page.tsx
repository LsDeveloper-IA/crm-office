// app/dashboard/empresas/page.tsx
import Card from "./components/card";
import { CompanyTable } from "./components/CompanyTable";
import prisma from "@/lib/prisma";

export default async function Company() {
  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    select: {
      cnpj: true,
      name: true,
      publicSpace: true,
      number: true,
      district: true,
      city: true,
      state: true,
      profile: {
        select: {
          taxRegime: true,
          accountant: true,
        },
      },
      companySectors: {
        select: {
          sector: {
            select: {
              name: true,
            },
          },
          owner: {
            select: {
              username: true,
            },
          },
        },
      },
    },
  });

  return (
    <main className="flex flex-col gap-7 flex-1 min-h-0">
      {/* Cards */}
      <div className="w-full h-24 flex items-center gap-4 justify-between">
        <Card />
        <Card />
        <Card />
        <Card />
        <Card />
      </div>

      {/* Tabela */}
      <div className="flex-1 bg-white rounded-lg p-7 overflow-auto min-h-0 shadow-2xl">
        <CompanyTable companies={companies} />
      </div>
    </main>
  );
}