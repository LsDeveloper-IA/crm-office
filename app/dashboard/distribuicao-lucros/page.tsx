export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DistribuicaoTable, type Row } from "./components/DistribuicaoTable";
import { normalizeDistributionSearch } from "@/lib/profit-distribution-input";
import { safeOwnershipForYear } from "@/lib/ownership";
import { sumCapital } from "@/lib/ownership-money";
import { partnerVisibility } from "@/lib/partner-periods.mjs";
import { ProfitDistributionStatus } from "@prisma/client";
import companiesWithoutDriveFolderData from "../../../empresas-sem-socios-sem-pasta-drive.json";
import automationFailureData from "../../../empresas-filtros-automacao.json";

const COMPANIES_WITHOUT_OWNERSHIP_DOCUMENTS = automationFailureData
  .filter(company => company.filter === "without-documents")
  .map(company => company.cnpj);
const COMPANIES_WITHOUT_DRIVE_FOLDER = automationFailureData
  .filter(company => company.filter === "without-drive-folder")
  .map(company => company.cnpj);

// Mapa CNPJ -> motivo de falha da automacao (um motivo por empresa).
const COMPANY_FAILURE_REASONS = Object.fromEntries(
  automationFailureData.map(company => [company.cnpj, company.filter]),
);

// Motivos usados pelo select de filtro, alem dos filtros fixos existentes.
const AUTOMATION_FAILURE_FILTER_OPTIONS = Array.from(
  new Set(automationFailureData.map(company => company.filter)),
).filter(filter => filter !== "without-documents" && filter !== "without-drive-folder");

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
  const currentYear = new Date().getFullYear();
  const defaultYear = years.includes(currentYear) ? currentYear : years.at(-1) ?? currentYear;
  const requestedYear = Number((await searchParams).year ?? defaultYear);
  const year = years.includes(requestedYear) ? requestedYear : defaultYear;
  const currentMonth = new Date().getMonth();

  const companies = await prisma.company.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      cnpj: true,
      name: true,

      profitSettings: { where: { referenceYear: year } },
      profitPartners: {
        select: {
          id: true,
          name: true,
          qsaPeriods: true,
          cpf: true, partnerCnpj: true, isCorporate: true, birthDate: true, ownershipHistory: true,

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
        where: { deletedAt: null },
        orderBy: { id: "asc" },
        select: {
          id: true,
          nome: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });
  const companySettings = Object.fromEntries(companies.flatMap((company) => {
    const settings = company.profitSettings?.[0];
    return settings ? [[company.cnpj, {
      participationPercentage: settings.participationPercentage == null ? null : Number(settings.participationPercentage),
      dividendTaxation: settings.dividendTaxation,
      status: settings.status,
      observation: settings.observation ?? "",
      caseAside: settings.caseAside ?? false,
    }]] : [];
  }));

  const rows = companies.flatMap<Row>((c) => {
    const companyName = safeString(c.name);
    // Sum every registered partner before the annual visibility filter.
    const hasPendingPartner = c.qsas.some(qsa => !c.profitPartners.some(partner =>
      normalizeDistributionSearch(partner.name) === normalizeDistributionSearch(qsa.nome)));
    const ownershipByPartner = new Map(c.profitPartners.map(partner =>
      [partner.id, safeOwnershipForYear(partner.ownershipHistory, year)]));
    const companyCapitalCents = hasPendingPartner ? null : sumCapital(c.profitPartners.map(partner =>
      ownershipByPartner.get(partner.id)?.ownershipValueCents));

    // =========================
    // ✅ PARCEIROS CADASTRADOS
    // =========================
    const registeredRows: Row[] = c.profitPartners.map((p) => {
      const ownership = ownershipByPartner.get(p.id)!;
      const visibility = partnerVisibility(p.qsaPeriods, year);
      const monthly = p.distributions.filter((item, index, all) =>
        all.findIndex((other) => other.referenceMonth === item.referenceMonth) === index);
      const visibleMonthly = monthly.filter((item) => visibility.visibleMonths.includes(item.referenceMonth - 1));
      const dist = visibleMonthly.find((item) => item.referenceMonth === currentMonth + 1) ?? visibleMonthly[0];

      return {
        companyCnpj: c.cnpj,
        companyName,
        companyCapitalCents,

        ...visibility,
        partnerCpf: p.cpf, partnerCnpj: p.partnerCnpj, partnerIsCorporate: p.isCorporate,
        partnerBirthDate: p.birthDate,
        ownershipPercentage: ownership.ownershipPercentage,
        ownershipValueCents: ownership.ownershipValueCents,
        ownershipQuotas: ownership.quotas,
        ownershipMonths: ownership.months,
        ownershipWarning: ownership.issue,
        monthlyDistributions: visibleMonthly.map((item) => ({
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
    }).filter((row) => row.visibleMonths.length > 0);

    // =========================
    // ⚠️ FALLBACK RECEITA
    // =========================
    const registeredNames = new Set(c.profitPartners.map((partner) => normalizeDistributionSearch(partner.name)));
    const pendingRows: Row[] = c.qsas.map((qsa, index) => ({
      companyCnpj: c.cnpj,
      companyName,

      partnerId: -(index + 1),
      qsaId: qsa.id,
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

  const companiesWithCapital = new Set(rows.filter(row => row.companyCapitalCents != null)
    .map(row => row.companyCnpj)).size;

  return (
    <main className="flex flex-col gap-7 flex-1 min-w-0 min-h-0">
      <div className="flex-1 bg-white rounded-lg p-3 xl:p-5 overflow-auto min-w-0 min-h-0 shadow-2xl">
        <h1 className="mb-4 text-lg font-semibold">Distribuição de lucros — Ano de referência {year}</h1>
        <p className="mb-4 text-sm text-slate-600" role="status">
          Capital social apurado em {companiesWithCapital} de {companies.length} empresas para {year}.
          {companiesWithCapital < companies.length && " Nas demais, falta um quadro societário completo e vigente no período. Dados de aditivos posteriores aparecem no ano correspondente."}
        </p>
        <DistribuicaoTable key={year} rows={rows} companySettings={companySettings}
          companiesWithoutDocuments={COMPANIES_WITHOUT_OWNERSHIP_DOCUMENTS}
          companiesWithoutDriveFolder={COMPANIES_WITHOUT_DRIVE_FOLDER}
          companyFailureReasons={COMPANY_FAILURE_REASONS}
          automationFailureFilterOptions={AUTOMATION_FAILURE_FILTER_OPTIONS} year={year} years={years}
          canCreatePartner={year === new Date().getFullYear()} />
      </div>
    </main>
  );
}
