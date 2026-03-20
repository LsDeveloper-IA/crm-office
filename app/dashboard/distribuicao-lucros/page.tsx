export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DistribuicaoTable } from "./components/DistribuicaoTable";

export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) return redirect("/");

  const companies = await prisma.company.findMany({
    select: {
      cnpj: true,
      name: true,
      profile: {
        select: {
          accountant: true,
          taxRegime: {
            select: {
              name: true
            }
          }
        }
      }
    },
    orderBy: { name: "asc" },
    take: 50
  });

  const data = companies.map((c) => ({
    cnpj: c.cnpj,
    name: c.name,
    accountant: c.profile?.accountant,
    taxRegime: c.profile?.taxRegime?.name
  }));

  return (
    <main className="flex flex-col gap-7 flex-1 min-h-0">

      <div className="flex-1 bg-white rounded-lg p-7 overflow-auto min-h-0 shadow-2xl">

        <DistribuicaoTable companies={data} />

      </div>

    </main>
  );
}