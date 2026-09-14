export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DistribuicaoTable, type Row } from "./components/DistribuicaoTable";
import { normalizeDistributionSearch } from "@/lib/profit-distribution-input";
import { ProfitDistributionStatus } from "@prisma/client";

function safeString(value?: string | null) {
  return value?.trim() || "-";
}

export default async function Dashboard({ searchParams }: {
  searchParams: Promise<{ year?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) return redirect("/");

  const availableYears = await prisma.referenceYear.findMany({ orderBy: { year: "asc" } });
  const years = availableYears.map((item) => item.year);
  const requestedYear = Number((await searchParams).year ?? 2025);
  const year = years.includes(requestedYear) ? requestedYear : 2025;
  const currentMonth = new Date().getMonth();

  const companies = await prisma.company.findMany({
    select: {
      cnpj: true,
      name: true,

      profitPartners: {
        select: {
          id: true,
          name: true,

          // Load every saved month so a page reload restores the annual table.
          distributions: {
            where: {
              referenceYear: year,
            },
            orderBy: {
              id: "desc",
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

  const rows = companies.flatMap<Row>((c) => {
    const companyName = safeString(c.name);

    // =========================
    // ✅ PARCEIROS CADASTRADOS
    // =========================
    const registeredRows: Row[] = c.profitPartners.map((p) => {
        const monthly = p.distributions.filter((item, index, all) =>
          all.findIndex((other) => other.referenceMonth === item.referenceMonth) === index);
        const dist = monthly.find((item) => item.referenceMonth === currentMonth + 1);

        return {
          companyCnpj: c.cnpj,
          companyName,

          monthlyDistributions: monthly.map((item) => ({
            month: item.referenceMonth - 1,
            participationPercentage: item.participationPercentage == null ? null : Number(item.participationPercentage),
            dividendTaxation: item.dividendTaxation,
            amount: item.amount == null ? null : Number(item.amount),
            status: item.status,
            observation: item.observation ?? "",
          })),

          partnerId: p.id,
          partnerName: safeString(p.name),

          participationPercentage:
            dist?.participationPercentage != null
              ? Number(dist.participationPercentage)
              : null,

          amount:
            dist?.amount != null
              ? Number(dist.amount)
              : null,

          status: dist?.status ?? ProfitDistributionStatus.NAO_ENCERRADO,

          observation: dist?.observation ?? "",
        };
      });

    // =========================
    // ⚠️ FALLBACK RECEITA
    // =========================
    const registeredNames = new Set(c.profitPartners.map((partner) => normalizeDistributionSearch(partner.name)));
    const pendingRows: Row[] = c.qsas.map((qsa, index) => ({
        companyCnpj: c.cnpj,
        companyName,

        partnerId: -(index + 1),
        partnerName: safeString(qsa.nome),

        participationPercentage: null,
        amount: null,
        status: ProfitDistributionStatus.NAO_ENCERRADO,
        observation: "",
      })).filter((row) => !registeredNames.has(normalizeDistributionSearch(row.partnerName)));
    if (registeredRows.length || pendingRows.length) return [...registeredRows, ...pendingRows];

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
    <main className="flex flex-col gap-7 flex-1 min-w-0 min-h-0">
      <div className="flex-1 bg-white rounded-lg p-3 xl:p-5 overflow-auto min-w-0 min-h-0 shadow-2xl">
        <h1 className="mb-4 text-lg font-semibold">Distribuição de lucros — Ano de referência {year}</h1>
        <DistribuicaoTable key={year} rows={rows} year={year} years={years} canCreatePartner={year === new Date().getFullYear()} />
      </div>
    </main>
  );
}
