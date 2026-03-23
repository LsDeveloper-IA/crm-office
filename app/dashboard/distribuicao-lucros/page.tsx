export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DistribuicaoTable } from "./components/DistribuicaoTable";

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) return redirect("/");

  // 🔥 AGORA CORRETO
  const selectedDate = normalizeDate(new Date());

  const companies = await prisma.company.findMany({
    select: {
      cnpj: true,
      name: true,

      profitPartners: {
        select: {
          id: true,
          name: true,
          distributions: {
            where: {
              referenceDate: selectedDate,
            },
          },
        },
      },

      qsas: {
        select: {
          nome: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = companies.flatMap((c) => {
    // ✅ parceiros cadastrados
    if (c.profitPartners.length > 0) {
      return c.profitPartners.map((p) => {
        const dist = p.distributions[0];

        return {
          companyCnpj: c.cnpj,
          companyName: c.name,

          partnerId: p.id,
          partnerName: p.name,

          participationPercentage: dist
            ? Number(dist.participationPercentage)
            : null,

          amount: dist
            ? Number(dist.amount)
            : null,

          status: dist?.status ?? "NAO_ENCERRADO",
          observation: dist?.observation ?? "",
        };
      });
    }

    // ⚠️ fallback Receita
    if (c.qsas.length > 0) {
      return c.qsas.map((qsa, index) => ({
        companyCnpj: c.cnpj,
        companyName: c.name,

        partnerId: -(index + 1), // 🔥 evita 0 duplicado
        partnerName: qsa.nome,

        participationPercentage: null,
        amount: null,
        status: "NAO_ENCERRADO",
        observation: "",
      }));
    }

    // 🧱 fallback final
    return [
      {
        companyCnpj: c.cnpj,
        companyName: c.name,

        partnerId: -999999, // 🔥 evita conflito
        partnerName: "Sem sócios",

        participationPercentage: null,
        amount: null,
        status: "NAO_ENCERRADO",
        observation: "",
      },
    ];
  });

  return (
    <main className="flex flex-col gap-7 flex-1 min-h-0">

      <div className="flex-1 bg-white rounded-lg p-7 overflow-auto min-h-0 shadow-2xl">

        <DistribuicaoTable rows={rows} />

      </div>

    </main>
  );
}