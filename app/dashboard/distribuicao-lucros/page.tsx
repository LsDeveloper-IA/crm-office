export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DistribuicaoTable } from "./components/DistribuicaoTable";
import { ProfitDistributionStatus } from "@prisma/client";

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function safeString(value?: string | null) {
  return value?.trim() || "-";
}

export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) return redirect("/");

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
    const companyName = safeString(c.name);

    // =========================
    // ✅ PARCEIROS CADASTRADOS
    // =========================
    if (c.profitPartners.length > 0) {
      return c.profitPartners.map((p) => {
        const dist = p.distributions?.[0];

        return {
          companyCnpj: c.cnpj,
          companyName,

          partnerId: p.id,
          partnerName: safeString(p.name),

          participationPercentage: dist?.participationPercentage != null
            ? Number(dist.participationPercentage)
            : null,

          amount: dist?.amount != null
            ? Number(dist.amount)
            : null,

          status:
            dist?.status ??
            ProfitDistributionStatus.NAO_ENCERRADO,

          observation: safeString(dist?.observation ?? ""),
        };
      });
    }

    // =========================
    // ⚠️ FALLBACK RECEITA (QSA)
    // =========================
    if (c.qsas.length > 0) {
      return c.qsas.map((qsa, index) => ({
        companyCnpj: c.cnpj,
        companyName,

        partnerId: -(index + 1), // evita conflito com DB
        partnerName: safeString(qsa.nome),

        participationPercentage: null,
        amount: null,
        status: ProfitDistributionStatus.NAO_ENCERRADO,
        observation: "",
      }));
    }

    // =========================
    // 🧱 FALLBACK FINAL
    // =========================
    return [
      {
        companyCnpj: c.cnpj,
        companyName,

        partnerId: -999999,
        partnerName: "Sem sócios",

        participationPercentage: null,
        amount: null,
        status: ProfitDistributionStatus.NAO_ENCERRADO,
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