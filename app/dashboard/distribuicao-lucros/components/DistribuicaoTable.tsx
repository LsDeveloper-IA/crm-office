"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Pencil, Check, X, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  hasDistributionChanges,
  hasNoPartnersPlaceholder,
  isValidDistributionNumber,
  matchesPartnerFilter,
  normalizeDistributionSearch,
} from "@/lib/profit-distribution-input";
import styles from "./DistribuicaoTable.module.css";
import { ProfitDistributionStatus } from "@prisma/client";
import {
  PROFIT_DISTRIBUTION_STATUS_OPTIONS,
} from "@/lib/profit-distribution-status";

import { DIVIDEND_TAXATION_OPTIONS, type DividendTaxationValue } from "@/lib/dividend-taxation";
import { DEFAULT_COMPANY_SETTINGS, hasCompanySettingsChanges, type ProfitCompanySettings } from "@/lib/profit-company-settings";
import { PartnerOwnershipSummary } from "./PartnerOwnershipSummary";
import { formatCapital } from "@/lib/ownership-money";
import { CompanySummaryRow } from "./CompanySummaryRow";
import { useOwnershipUpdates } from "@/hooks/useOwnershipUpdates";
import { mergeOwnershipRows, ownershipRowKey } from "@/lib/ownership-row-sync";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type MonthlyDistribution = {
  month: number;
  participationPercentage?: number | null;
  dividendTaxation?: DividendTaxationValue | null;
  amount?: number | null;
  status: ProfitDistributionStatus;
  observation?: string;
};

export type Row = {
  visibleMonths?: number[];
  caption?: string;
  month?: number;
  monthlyDistributions?: MonthlyDistribution[];
  companyCnpj: string;
  companyName: string;
  partnerId: number;
  qsaId?: number;
  partnerName: string;
  partnerCpf?: string | null;
  partnerCnpj?: string | null;
  partnerIsCorporate?: boolean;
  partnerBirthDate?: string | null;
  ownershipPercentage?: number | null;
  ownershipDelta?: number | null;
  ownershipValueCents?: string | null;
  ownershipQuotas?: string | null;
  companyCapitalCents?: string | null;
  ownershipMonths?: { month: number; ownershipPercentage: number | null; ownershipDelta: number | null }[];
  ownershipWarning?: string | null;
  participationPercentage?: number | null;
  dividendTaxation?: DividendTaxationValue | null;
  amount?: number | null;
  status: ProfitDistributionStatus;
  observation?: string;
};

type Props = {
  rows: Row[];
  companySettings?: Record<string, ProfitCompanySettings>;
  companiesWithoutDocuments?: string[];
  companiesWithoutDriveFolder?: string[];
  companyFailureReasons?: Record<string, string>;
  automationFailureFilterOptions?: string[];
  year: number;
  years: number[];
  canCreatePartner: boolean;
};

const PAGE_SIZE = 25;
const currencyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const currencyInputFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function groupKey(row: Row) {
  return `${row.companyCnpj}-${row.partnerId}-summary`;
}

function indexRows(data: Row[]) {
  const summaries: Row[] = [];
  const monthsByGroup = new Map<string, Row[]>();
  const totalsInCents = new Map<string, number>();
  for (const row of data) {
    if (row.month == null) {
      summaries.push(row);
      continue;
    }
    const key = groupKey(row);
    const months = monthsByGroup.get(key);
    if (months) months.push(row);
    else monthsByGroup.set(key, [row]);
    totalsInCents.set(key, (totalsInCents.get(key) ?? 0) + Math.round((row.amount ?? 0) * 100));
  }
  return { summaries, monthsByGroup, totalsInCents };
}

const DEFAULT_STATUS = ProfitDistributionStatus.NAO_ENCERRADO;

function normalizeRow(row: Row): Row {
  return {
    ...row,
    status: row.status ?? ProfitDistributionStatus.NAO_ENCERRADO,
  };
}

function getRowKey(row: Row) {
  return `${row.companyCnpj}-${row.partnerId}-${row.month ?? "summary"}`;
}

function formatCurrency(value?: number | null) {
  if (value == null) return "-";
  return currencyFormatter.format(value);
}

function parseCurrency(value: string) {
  return Number(
    value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")
  );
}

function formatCurrencyInput(value: string) {
  const numbers = value.replace(/\D/g, "");
  const number = Number(numbers) / 100;

  return currencyInputFormatter.format(number);
}

export function DistribuicaoTable({
  rows, year, years, canCreatePartner, companySettings = {}, companiesWithoutDocuments = [],
  companiesWithoutDriveFolder = [], companyFailureReasons = {}, automationFailureFilterOptions = [],
}: Props) {
  useOwnershipUpdates();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const targetCompany = params.get("company");
  const targetPartner = params.get("partner");
  const focusRequest = params.get("focus") ?? "";
  const targetKey = targetCompany && targetPartner ? `${targetCompany}-${targetPartner}-summary` : null;
  const handledTarget = useRef<string | null>(null);
  const [isChangingYear, startYearTransition] = useTransition();
  const [expandedCompanies, setExpandedCompanies] = useState<Record<string, boolean>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const incomingRows = useMemo(() => rows.flatMap((row) => [
    normalizeRow(row),
    ...MONTHS.flatMap((_, month) => row.visibleMonths && !row.visibleMonths.includes(month) ? [] : [normalizeRow({
      ...row,
      participationPercentage: null,
      dividendTaxation: null,
      amount: null,
      status: DEFAULT_STATUS,
      observation: "",
      ...row.monthlyDistributions?.find((distribution) => distribution.month === month),
      ...row.ownershipMonths?.find((item) => item.month === month),
      month,
    })]),
  ]), [rows]);
  const [data, setData] = useState<Row[]>(() => incomingRows);
  const previousServerKeys = useRef<Set<string>>(new Set());
  const [savedCompanySettings, setSavedCompanySettings] = useState(companySettings);
  const [companyDrafts, setCompanyDrafts] = useState<Record<string, ProfitCompanySettings>>({});
  const [savingCompany, setSavingCompany] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    ProfitDistributionStatus | ""
  >("");
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [failureOverrides, setFailureOverrides] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(window.localStorage.getItem("distribuicao-failure-overrides") ?? "{}"); }
    catch { return {}; }
  });

  const allFailureReasonOptions = Array.from(new Set([
    "without-documents",
    "without-drive-folder",
    ...(automationFailureFilterOptions ?? []),
  ]));

  const effectiveFailureReasonCounts = new Map<string, number>();
  const allFailureCompanies = new Set([
    ...Object.keys(companyFailureReasons),
    ...Object.keys(failureOverrides),
  ]);
  for (const cnpj of allFailureCompanies) {
    const reason = failureOverrides[cnpj] ?? companyFailureReasons[cnpj];
    if (!reason) continue;
    effectiveFailureReasonCounts.set(reason, (effectiveFailureReasonCounts.get(reason) ?? 0) + 1);
  }
  const visibleFailureFilters = allFailureReasonOptions.filter(reason =>
    (effectiveFailureReasonCounts.get(reason) ?? 0) > 0,
  );

  const headerFailureFilters = visibleFailureFilters.filter(reason =>
    reason !== "case-aside"
    && reason !== "without-documents"
    && reason !== "without-drive-folder",
  );

  const rowFailureReasonOptions = Array.from(new Set(["case-aside", ...visibleFailureFilters]));

  function changeFailureReason(cnpj: string, reason: string) {
    setFailureOverrides(previous => {
      const next = { ...previous };
      if (reason) next[cnpj] = reason;
      else delete next[cnpj];
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem("distribuicao-failure-overrides", JSON.stringify(next)); }
        catch { /* ignore */ }
      }
      return next;
    });
  }

  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});
  const [originalRows, setOriginalRows] = useState<Record<string, Row>>({});
  const [savedPartnerIds, setSavedPartnerIds] = useState<Record<string, number>>({});
  const [loadingRow, setLoadingRow] = useState<string | null>(null);

  const saveLock = useRef(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pendingYear, setPendingYear] = useState<string | null>(null);
  const [isCreatingPartner, setIsCreatingPartner] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPartner, setNewPartner] = useState({ companyCnpj: "", partnerName: "" });

  // Server refresh/HMR can deliver new OCR data without remounting this year's table.
  // Update read-only ownership fields while preserving unsaved distribution edits.
  useEffect(() => {
    const oldKeys = previousServerKeys.current;
    previousServerKeys.current = new Set(incomingRows.map(ownershipRowKey));
    setData(previous => mergeOwnershipRows(previous, incomingRows, oldKeys));
  }, [incomingRows]);

  const { summaries, monthsByGroup, totalsInCents } = useMemo(() => indexRows(data), [data]);
  const filteredData = useMemo(() => {
    const term = normalizeDistributionSearch(search);
    const cnpjTerm = search.replace(/\D/g, "");
    // Filter whole companies: their totals always include every partner.
    const grouped = new Map<string, { companyCnpj: string; companyName: string; partners: Row[]; totalInCents: number }>();
    for (const row of summaries) {
      let company = grouped.get(row.companyCnpj);
      if (!company) {
        company = { companyCnpj: row.companyCnpj, companyName: row.companyName, partners: [], totalInCents: 0 };
        grouped.set(row.companyCnpj, company);
      }
      company.partners.push(row);
      company.totalInCents += totalsInCents.get(groupKey(row)) ?? 0;
    }
    return [...grouped.values()].filter((company) => company.partners.some((row) => {
      const matchSearch = normalizeDistributionSearch(row.companyName).includes(term)
        || normalizeDistributionSearch(row.partnerName).includes(term)
        || (cnpjTerm.length > 0 && (row.companyCnpj.includes(cnpjTerm) || row.partnerCpf?.includes(cnpjTerm)));
      const matchStatus = !statusFilter
        || (savedCompanySettings[row.companyCnpj] ?? DEFAULT_COMPANY_SETTINGS).status === statusFilter;
      const settings = savedCompanySettings[company.companyCnpj] ?? DEFAULT_COMPANY_SETTINGS;
      const companyFailureReason = failureOverrides[company.companyCnpj] ?? companyFailureReasons[company.companyCnpj];
      const isAutomationFailureFilter = partnerFilter === "without-documents"
        || partnerFilter === "without-drive-folder"
        || partnerFilter === "needs-review-policy"
        || partnerFilter === "skip-instructed"
        || automationFailureFilterOptions.includes(partnerFilter);
      // "Caso à parte" pode vir do flag salvo (settings) ou da seleção manual do filtro na linha.
      const effectiveCaseAside = settings.caseAside || companyFailureReason === "case-aside";
      let matchPartnerFilter = false;
      if (partnerFilter === "case-aside") {
        const hasExclusiveFailure = Boolean (companyFailureReason)
          && companyFailureReason !== "case-aside";
        const hasDriveOrDocsIssue =
          companiesWithoutDriveFolder.includes(company.companyCnpj)
          || companiesWithoutDocuments.includes(company.companyCnpj);
        const keepInCaseAside = !(hasExclusiveFailure || hasDriveOrDocsIssue);
        matchPartnerFilter = (effectiveCaseAside || hasNoPartnersPlaceholder(company.partners)) && keepInCaseAside;
      } else if (isAutomationFailureFilter) {
        matchPartnerFilter = companyFailureReason === partnerFilter;
      } else {
        matchPartnerFilter = matchesPartnerFilter(company.partners, partnerFilter as "all" | "case-aside" | "without-documents" | "without-drive-folder", effectiveCaseAside,
          companiesWithoutDocuments.includes(company.companyCnpj),
          companiesWithoutDriveFolder.includes(company.companyCnpj));
      }
      return matchSearch && matchStatus && matchPartnerFilter;
    }));
  }, [summaries, totalsInCents, search, statusFilter, partnerFilter, savedCompanySettings,
    companiesWithoutDocuments, companiesWithoutDriveFolder, companyFailureReasons, automationFailureFilterOptions,
    failureOverrides]);
  const pageCount = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleData = filteredData.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    if (!targetCompany || !targetKey) { handledTarget.current = null; return; }
    const requestKey = `${targetKey}:${focusRequest}`;
    if (handledTarget.current === requestKey) return;
    setSearch("");
    setStatusFilter("");
    const targetHasNoPartners = hasNoPartnersPlaceholder(
      summaries.filter(row => row.companyCnpj === targetCompany),
    );
    setPartnerFilter(targetHasNoPartners || savedCompanySettings[targetCompany]?.caseAside
      ? "case-aside"
      : "all");
    const allCompanies = [...new Set(summaries.map(row => row.companyCnpj))];
    const index = allCompanies.indexOf(targetCompany);
    if (index < 0) return;
    handledTarget.current = requestKey;
    setPage(Math.floor(index / PAGE_SIZE) + 1);
    setExpandedCompanies(prev => ({ ...prev, [targetCompany]: true }));
    setExpandedRows(prev => ({ ...prev, [targetKey]: true }));
  }, [targetCompany, targetKey, focusRequest, summaries, savedCompanySettings]);

  useEffect(() => {
    if (!targetKey) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(`partner-${targetKey}`);
      element?.scrollIntoView({ block: "center", behavior: "smooth" });
      element?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [targetKey, focusRequest, currentPage, expandedCompanies, expandedRows, summaries]);

  const dirtyKeys = useMemo(() => new Set(data
    .filter((row) => row.month != null && originalRows[getRowKey(row)]
      && editingRows[groupKey(row)] && hasDistributionChanges(row, originalRows[getRowKey(row)]))
    .map(getRowKey)), [data, originalRows, editingRows]);
  const companies = useMemo(() => Array.from(new Map(summaries.map((row) =>
    [row.companyCnpj, { cnpj: row.companyCnpj, name: row.companyName }])).values()), [summaries]);
  const dirtyCompanyCount = Object.entries(companyDrafts).filter(([cnpj, draft]) =>
    hasCompanySettingsChanges(draft, savedCompanySettings[cnpj] ?? DEFAULT_COMPANY_SETTINGS)).length;
  const hasUnsavedChanges = dirtyKeys.size > 0 || dirtyCompanyCount > 0;
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

  function toggleEdit(row: Row, value: boolean) {
    const key = groupKey(row);
    if (value) {
      const groupRows = [row, ...(monthsByGroup.get(key) ?? [])];
      setOriginalRows((prev) => ({
        ...prev,
        ...Object.fromEntries(groupRows
          .map((item) => [getRowKey(item), { ...item }])),
      }));
      setExpandedRows((prev) => ({ ...prev, [key]: true }));
    }
    setEditingRows((prev) => ({ ...prev, [key]: value }));
  }

  function cancelEdit(row: Row) {
    const key = groupKey(row);
    setData((prev) => prev.map((item) =>
      groupKey(item) === key ? originalRows[getRowKey(item)] ?? item : item
    ));
    toggleEdit(row, false);
  }

  function updateRow(row: Row, changes: Partial<Row>) {
    // The annual partner percentage is persisted in all twelve months.
    if (row.month == null) {
      if (changes.participationPercentage === undefined) return;
      setData((prev) => prev.map((item) => groupKey(item) === groupKey(row)
        ? { ...item, participationPercentage: changes.participationPercentage } : item));
      return;
    }
    changes = {
      ...(changes.dividendTaxation !== undefined ? { dividendTaxation: changes.dividendTaxation } : {}),
      ...(changes.amount !== undefined ? { amount: changes.amount } : {}),
      ...(changes.observation !== undefined ? { observation: changes.observation } : {}),
    };
    const month = row.month ?? new Date().getMonth();
    setData((prev) => prev.map((item) => {
      const samePeriod = item.month === month || (item.month == null && month === new Date().getMonth());
      if (groupKey(item) !== groupKey(row) || !samePeriod) return item;
      // The summary amount is derived from all months, never copied from one month.
      if (item.month == null) {
        const summaryChanges = { ...changes };
        delete summaryChanges.amount;
        return normalizeRow({ ...item, ...summaryChanges });
      }
      return normalizeRow({ ...item, ...changes });
    }));
  }

  async function saveRow(row: Row) {
    if (saveLock.current) return;
    saveLock.current = true;
    setNotice(null);
    const key = groupKey(row);
    setLoadingRow(key);
    try {
      const summary = summaries.find((item) => groupKey(item) === key);
      const percentageChanged = summary && originalRows[key]
        && (summary.participationPercentage ?? null) !== (originalRows[key].participationPercentage ?? null);
      const changedMonths = (monthsByGroup.get(key) ?? []).filter((item) =>
        row.month != null && !percentageChanged ? item.month === row.month : dirtyKeys.has(getRowKey(item)));
      for (const month of changedMonths) {
        if (!isValidDistributionNumber(month.participationPercentage, 0, 100)
          || !isValidDistributionNumber(month.amount, -9999999999999.99, 9999999999999.99)) {
          throw new Error(`${MONTHS[month.month!]}: confira o valor e a porcentagem (0 a 100, até duas casas decimais).`);
        }
      }
      if (changedMonths.length && row.partnerId === -999999) {
        throw new Error("Cadastre um socio antes de salvar a distribuicao desta empresa.");
      }
      let partnerId = savedPartnerIds[key] ?? row.partnerId;
      if (changedMonths.length && partnerId <= 0) {
        const response = await fetch("/api/profit-distributions/partners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyCnpj: row.companyCnpj, name: row.partnerName }),
        });
        if (!response.ok) throw new Error("Erro ao salvar parceiro");
        partnerId = (await response.json()).id;
        setSavedPartnerIds((prev) => ({ ...prev, [key]: partnerId }));
      }
      for (const monthRow of changedMonths) {
        const response = await fetch("/api/profit-distributions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyCnpj: row.companyCnpj,
            partnerId,
            month: monthRow.month! + 1,
            year,
            participationPercentage: monthRow.participationPercentage ?? null,
            dividendTaxation: monthRow.dividendTaxation ?? null,
            amount: monthRow.amount ?? null,
            status: monthRow.status,
            observation: monthRow.observation ?? "",
          }),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => null);
          throw new Error(`Erro ao salvar ${MONTHS[monthRow.month!]}: ${error?.error || `falha no servidor (HTTP ${response.status}).`}`);
        }
        const saved = await response.json();
        const savedRow: Row = {
          ...monthRow,
          participationPercentage: saved.participationPercentage == null ? null : Number(saved.participationPercentage),
          amount: saved.amount == null ? null : Number(saved.amount),
          dividendTaxation: saved.dividendTaxation,
          status: saved.status,
          observation: saved.observation ?? "",
        };
        setData((prev) => prev.map((item) => getRowKey(item) === getRowKey(monthRow) ? savedRow : item));
        setOriginalRows((prev) => ({
          ...prev,
          [getRowKey(monthRow)]: savedRow,
          ...(monthRow.month === new Date().getMonth()
            ? { [key]: { ...savedRow, month: undefined } } : {}),
        }));
      }
      setNotice({
        kind: "success", text: changedMonths.length
          ? `${changedMonths.length} mês(es) salvo(s) em ${year}.`
          : "Nenhuma alteração para salvar."
      });
      if (row.month == null) toggleEdit(row, false);
    } catch (err) {
      console.error(err);
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "Erro ao salvar" });
    } finally {
      saveLock.current = false;
      setLoadingRow(null);
    }
  }

  function closeCompanyEdit(cnpj: string) {
    setCompanyDrafts((prev) => {
      const next = { ...prev };
      delete next[cnpj];
      return next;
    });
  }

  async function toggleCaseAside(cnpj: string) {
    if (saveLock.current) return;
    const current = savedCompanySettings[cnpj] ?? DEFAULT_COMPANY_SETTINGS;
    const next = { ...current, caseAside: !current.caseAside };
    saveLock.current = true;
    setSavingCompany(cnpj);
    try {
      const response = await fetch("/api/profit-distributions/company", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCnpj: cnpj, year, ...next }),
      });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || "Erro ao marcar caso à parte.");
      setSavedCompanySettings((prev) => ({ ...prev, [cnpj]: saved }));
      setNotice({ kind: "success", text: saved.caseAside ? "Empresa marcada como caso à parte." : "Marcação removida." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Erro ao marcar caso à parte." });
    } finally {
      saveLock.current = false;
      setSavingCompany(null);
    }
  }
  async function saveCompany(cnpj: string) {
    const draft = companyDrafts[cnpj];
    if (!draft || saveLock.current) return;
    if (!isValidDistributionNumber(draft.participationPercentage, 0, 100)) {
      setNotice({ kind: "error", text: "Percentual deve estar entre 0 e 100, com ate duas casas decimais." });
      return;
    }
    saveLock.current = true;
    setSavingCompany(cnpj);
    try {
      const response = await fetch("/api/profit-distributions/company", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCnpj: cnpj, year, ...draft }),
      });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || "Erro ao salvar empresa.");
      setSavedCompanySettings((prev) => ({ ...prev, [cnpj]: saved }));
      closeCompanyEdit(cnpj);
      setNotice({ kind: "success", text: "Dados da empresa salvos." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Erro ao salvar empresa." });
    } finally {
      saveLock.current = false;
      setSavingCompany(null);
    }
  }

  async function handleCreatePartner() {
    if (!canCreatePartner || saveLock.current) return;
    saveLock.current = true;
    setIsCreatingPartner(true);
    setNotice(null);
    try {
      const response = await fetch("/api/profit-distributions/partners", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyCnpj: newPartner.companyCnpj, name: newPartner.partnerName.trim() }),
      });
      const partner = await response.json();
      if (!response.ok) throw new Error(partner.error || "Erro ao criar sócio");
      if (!summaries.some((row) => row.companyCnpj === newPartner.companyCnpj
        && (row.partnerId === partner.id || normalizeDistributionSearch(row.partnerName) === normalizeDistributionSearch(partner.name)))) {
        const parent: Row = {
          companyCnpj: newPartner.companyCnpj,
          companyName: companies.find((company) => company.cnpj === newPartner.companyCnpj)?.name ?? newPartner.companyCnpj,
          partnerId: partner.id, partnerName: partner.name, status: DEFAULT_STATUS
        };
        setData((prev) => [...prev.filter((item) => !(item.companyCnpj === parent.companyCnpj && item.partnerId === -999999)), parent,
        ...MONTHS.map((_, month) => ({ ...parent, month, amount: null, participationPercentage: null, dividendTaxation: null, observation: "" }))]);
        setExpandedRows((prev) => ({ ...prev, [groupKey(parent)]: true }));
      }
      setExpandedCompanies((prev) => ({ ...prev, [newPartner.companyCnpj]: true }));
      setSearch(partner.name);
      setStatusFilter("");
      setPage(1);
      setNewPartner({ companyCnpj: "", partnerName: "" });
      setIsModalOpen(false);
      setNotice({ kind: "success", text: "Sócio disponível. Preencha e salve os meses desejados." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Erro ao criar sócio" });
    } finally {
      saveLock.current = false;
      setIsCreatingPartner(false);
    }
  }

  async function deletePartner(row: Row) {
    if ((row.partnerId < 1 && !row.qsaId) || saveLock.current) return;
    const isPendingQsa = !!row.qsaId;
    const confirmed = window.confirm(
      isPendingQsa
        ? `Tem certeza que deseja remover ${row.partnerName} do QSA desta empresa?`
        : `Tem certeza que deseja excluir o s\u00f3cio ${row.partnerName} e todos os lan\u00e7amentos financeiros vinculados? Essa a\u00e7\u00e3o n\u00e3o pode ser desfeita.`
    );
    if (!confirmed) return;

    const key = groupKey(row);
    saveLock.current = true;
    setLoadingRow(key);
    setNotice(null);
    try {
      const endpoint = isPendingQsa
        ? `/api/profit-distributions/partners/receita/${row.qsaId}`
        : `/api/profit-distributions/partners/${row.partnerId}`;
      const response = await fetch(endpoint, { method: "DELETE" });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Não foi possível excluir o sócio.");
      setData(previous => previous.filter(item => groupKey(item) !== key));
      setEditingRows(previous => { const next = { ...previous }; delete next[key]; return next; });
      setOriginalRows(previous => Object.fromEntries(Object.entries(previous)
        .filter(([rowKey]) => !rowKey.startsWith(`${row.companyCnpj}-${row.partnerId}-`))));
      setExpandedRows(previous => { const next = { ...previous }; delete next[key]; return next; });
      setNotice({ kind: "success", text: "Sócio excluído." });
      router.refresh();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Não foi possível excluir o sócio." });
    } finally {
      saveLock.current = false;
      setLoadingRow(null);
    }
  }

  return (
    <>
      {/* HEADER */}
      <div className="flex flex-col gap-3 mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex items-center gap-2 text-sm">
          Ano de referência
          <select
            className="border rounded px-3 py-2"
            value={year}
            disabled={isChangingYear || loadingRow !== null || isCreatingPartner || savingCompany !== null}
            onChange={(event) => {
              const nextYear = event.target.value;
              if (hasUnsavedChanges) { setPendingYear(nextYear); return; }
              startYearTransition(() => router.push(`${pathname}?year=${nextYear}`));
            }}
          >
            {years.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          {isChangingYear && <span role="status">Carregando...</span>}
        </label>
        <input
          aria-label="Buscar empresa, sócio ou CNPJ"
          placeholder="Buscar empresa, sócio ou CNPJ..."
          className="w-full max-w-md border rounded px-3 py-2 text-sm"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />

        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
          <select
            className="border rounded px-3 py-2 text-sm"
            aria-label="Filtrar por status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as ProfitDistributionStatus | "");
              setPage(1);
            }}
          >
            <option value="">Todos status</option>
            {PROFIT_DISTRIBUTION_STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>
                {status.shortLabel}
              </option>
            ))}
          </select>

          <select
            className="border rounded px-3 py-2 text-sm"
            aria-label="Filtrar por sócios"
            value={partnerFilter}
            onChange={(e) => {
              setPartnerFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">Empresas com sócios (exceto casos à parte)</option>
            <option value="case-aside">Somente casos à parte</option>
            <option value="without-documents">Sem documentos</option>
            <option value="without-drive-folder">Sem pasta no Drive</option>
            {headerFailureFilters.length > 0 && headerFailureFilters.map(filter => (
              <option key={filter} value={filter}>
                {({
                  "skip-no-importable-ownership-history": "Sem histórico societǭrio importǭvel",
                  "needs-review-ambiguous-partner-link": "Vínculo ambíguo de sócio",
                  "failed": "Falha de persistǦncia",
                  "needs-review-policy": "Revisão manual (política)",
                  "skip-instructed": "Ignorada por instruçǜo",
                } as Record<string, string>)[filter] ?? filter}
              </option>
            ))}
          </select>

          {canCreatePartner && <button
            className="px-3 py-2 text-sm border rounded-md hover:bg-muted whitespace-nowrap"
            disabled={isCreatingPartner || loadingRow !== null || savingCompany !== null}
            onClick={() => { setNotice(null); setIsModalOpen(true); }}
          >
            + Sócio
          </button>}
        </div>
      </div>

      {dirtyKeys.size > 0 && <p className="mb-3 text-sm text-amber-800" role="status">{dirtyKeys.size} mês(es) com alterações não salvas.</p>}
      {dirtyCompanyCount > 0 && <p className="mb-3 text-sm text-amber-800" role="status">{dirtyCompanyCount} empresa(s) com dados pendentes de salvar.</p>}
      {(search || statusFilter || partnerFilter !== "all") && <button type="button" className="mb-3 text-sm underline" onClick={() => { setSearch(""); setStatusFilter(""); setPartnerFilter("all"); setPage(1); }}>Limpar filtros</button>}
      {/* TABELA */}
      <div className={styles.container}>
        <Table className={`${styles.table} table-fixed w-full text-sm`}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[3%]">#</TableHead>
              <TableHead colSpan={2} className="w-[26%]">Empresa / Sócio / Mês</TableHead>
              <TableHead className="w-[12%] text-right">Capital Social</TableHead>
              <TableHead className="w-[7%] text-center">%</TableHead>
              <TableHead className="w-[12%] text-center">Tributação de Dividendos</TableHead>
              <TableHead className="w-[11%] text-right">Valor</TableHead>
              <TableHead className="w-[11%] text-center">Status</TableHead>
              <TableHead className="w-[12%]">Observação</TableHead>
              <TableHead className="w-[6%] text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {visibleData.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center py-6">Nenhum resultado encontrado.</TableCell></TableRow>
            )}
            {visibleData.flatMap((company, index) => {
              const companyKey = `company-${company.companyCnpj}`;
              const expanded = !!expandedCompanies[company.companyCnpj];
              const settings = companyDrafts[company.companyCnpj]
                ?? savedCompanySettings[company.companyCnpj]
                ?? DEFAULT_COMPANY_SETTINGS;
              const hasNoPartners = hasNoPartnersPlaceholder(company.partners);
              const companyRow = (
                <CompanySummaryRow key={companyKey}
                  name={company.companyName} cnpj={company.companyCnpj} year={year} index={pageStart + index + 1}
                  total={formatCurrency(company.totalInCents / 100)} expanded={expanded}
                  capitalCents={company.partners[0]?.companyCapitalCents ?? null}
                  percentage={company.partners.some((partner) => partner.ownershipPercentage == null)
                    ? null
                    : company.partners.reduce((sum, partner) => sum + Math.round(partner.ownershipPercentage! * 100), 0) / 100}
                  settings={hasNoPartners ? { ...settings, caseAside: true } : settings}
                  caseAsideLocked={hasNoPartners}
                  editing={!!companyDrafts[company.companyCnpj]}
                  busy={savingCompany !== null || loadingRow !== null || isCreatingPartner}
                  saving={savingCompany === company.companyCnpj}
                  onToggle={() => setExpandedCompanies((prev) => ({ ...prev, [company.companyCnpj]: !prev[company.companyCnpj] }))}
                  onEdit={() => setCompanyDrafts((prev) => ({ ...prev, [company.companyCnpj]: { ...(savedCompanySettings[company.companyCnpj] ?? DEFAULT_COMPANY_SETTINGS) } }))}
                  onChange={(changes) => setCompanyDrafts((prev) => ({ ...prev, [company.companyCnpj]: { ...prev[company.companyCnpj], ...changes } }))}
                  onToggleCaseAside={() => void toggleCaseAside(company.companyCnpj)}
                  onSave={() => void saveCompany(company.companyCnpj)}
                  onCancel={() => closeCompanyEdit(company.companyCnpj)}
                  failureReason={failureOverrides[company.companyCnpj] ?? companyFailureReasons[company.companyCnpj]}
                  failureReasonOptions={rowFailureReasonOptions}
                  onChangeFailureReason={(reason) => changeFailureReason(company.companyCnpj, reason)}
                />
              );
              if (!expanded) return [companyRow];
              return [companyRow, ...company.partners.flatMap((parent) => [
                parent,
                ...(expandedRows[getRowKey(parent)] ? (monthsByGroup.get(groupKey(parent)) ?? []) : []),
              ]).map((row) => {
                const key = getRowKey(row);
                const isEditing = editingRows[groupKey(row)];
                const isLoading = loadingRow === groupKey(row);
                const isMonthlyEditing = isEditing && row.month != null;
                const displayedAmount = row.month == null
                  ? (totalsInCents.get(groupKey(row)) ?? 0) / 100
                  : row.amount;
                return (
                  <TableRow key={key} id={row.month == null ? `partner-${key}` : undefined} tabIndex={row.month == null ? -1 : undefined} data-highlighted={key === targetKey || undefined} className={row.month != null ? styles.monthRow : styles.summaryRow} data-editing={isEditing || undefined} data-dirty={dirtyKeys.has(key) || undefined}>
                    {row.month != null ? (
                      <TableCell data-label="Mês" colSpan={3} className={styles.monthCell}><div className={styles.monthLabel}><span className={styles.monthNumber}>{String(row.month + 1).padStart(2, "0")}</span><span>{MONTHS[row.month]}</span>{row.ownershipDelta != null && row.ownershipDelta !== 0 && <span title="Variação da participação em pontos percentuais" className={row.ownershipDelta > 0 ? "text-emerald-700" : "text-red-700"}>{row.ownershipDelta > 0 ? "+" : ""}{row.ownershipDelta.toLocaleString("pt-BR")}%</span>}{dirtyKeys.has(key) && <span className={styles.unsaved}>Não salvo</span>}</div></TableCell>
                    ) : (
                      <>
                        <TableCell data-empty="true" />
                        <TableCell data-label="Sócio" colSpan={2}>
                          <div className="flex min-w-0 items-center gap-2 pl-6">
                            <button
                              type="button"
                              className={styles.expandButton}
                              aria-expanded={!!expandedRows[key]}
                              aria-label={`${expandedRows[key] ? "Recolher" : "Expandir"} meses de ${row.companyName}, ${row.partnerName}`}
                              onClick={() => setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }))}
                            >
                              {expandedRows[key] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                            <div className="min-w-0"><span className={styles.companyName} title={row.partnerName}>{row.partnerName}</span><PartnerOwnershipSummary cpf={row.partnerCpf} cnpj={row.partnerCnpj} isCorporate={row.partnerIsCorporate} birthDate={row.partnerBirthDate} quotas={row.ownershipQuotas} warning={row.ownershipWarning} /><span className={styles.summaryCaption}>{row.caption ?? `Sócio ativo · ${year}`}</span></div>
                          </div>
                        </TableCell>
                      </>
                    )}

                    <TableCell data-label="Capital Social" data-empty={row.month != null ? "true" : undefined} className="text-right tabular-nums">{row.month == null ? formatCapital(row.ownershipValueCents) : null}</TableCell>
                    <TableCell data-label={row.month == null ? "%" : undefined} data-empty={row.month != null ? "true" : undefined} className="text-center">
                      {row.month == null && (isEditing ? (
                        <input type="number" min={0} max={100} step="0.01" className={styles.percentageInput}
                          aria-label={`Porcentagem de ${row.partnerName}`} disabled={isLoading}
                          title="Percentual anual do socio, aplicado aos doze meses."
                          value={row.participationPercentage ?? ""}
                          onChange={(e) => updateRow(row, { participationPercentage: e.target.value === "" ? null : Number(e.target.value) })} />
                      ) : row.ownershipPercentage == null ? "--" : `${row.ownershipPercentage.toLocaleString("pt-BR")}%`)}
                    </TableCell>
                    <TableCell data-label={row.month != null ? "Tributa\u00e7\u00e3o de Dividendos" : undefined} data-empty={row.month == null ? "true" : undefined} className="text-center">
                      {row.month != null && (isMonthlyEditing ? (
                        <select className="w-full border rounded px-2 py-1" disabled={isLoading}
                          aria-label={`Tributa\u00e7\u00e3o de ${MONTHS[row.month]}, ${row.partnerName}`}
                          value={row.dividendTaxation ?? ""}
                          onChange={(e) => updateRow(row, { dividendTaxation: e.target.value === "" ? null : e.target.value as DividendTaxationValue })}>
                          <option value="">--</option>
                          {DIVIDEND_TAXATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      ) : DIVIDEND_TAXATION_OPTIONS.find((option) => option.value === row.dividendTaxation)?.label ?? "--")}
                    </TableCell>

                    <TableCell data-label="Valor" className={`text-right tabular-nums ${row.month == null ? styles.annualAmount : styles.monthAmount}`}>
                      {isMonthlyEditing ? (
                        <input
                          aria-label={`Valor de ${MONTHS[row.month!]}, ${row.partnerName}`}
                          disabled={isLoading}
                          className="w-full border rounded px-2 py-1"
                          value={
                            row.amount != null
                              ? formatCurrency(row.amount).replace("R$ ", "")
                              : ""
                          }
                          onChange={(e) => {
                            if (e.target.value === "") { updateRow(row, { amount: null }); return; }
                            const masked = formatCurrencyInput(e.target.value);
                            e.target.value = masked;

                            updateRow(row, {
                              amount: parseCurrency(masked),
                            });
                          }}
                        />
                      ) : (
                        formatCurrency(displayedAmount)
                      )}
                    </TableCell>

                    <TableCell data-empty="true" />

                    <TableCell data-label="Observação">
                      {isMonthlyEditing ? (
                        <input
                          aria-label={`Observação de ${MONTHS[row.month!]}, ${row.partnerName}`}
                          disabled={isLoading}
                          className="w-full border rounded px-2 py-1"
                          value={row.observation ?? ""}
                          onChange={(e) =>
                            updateRow(row, {
                              observation: e.target.value,
                            })
                          }
                        />
                      ) : (
                        <span className={styles.observation}>{row.observation?.trim() || "--"}</span>
                      )}
                    </TableCell>

                    <TableCell data-label="Ações" className="text-center">
                      {row.month != null ? (isEditing && (
                        <button type="button" className={styles.monthSaveButton} title={`Salvar ${MONTHS[row.month]}`} aria-label={`Salvar ${MONTHS[row.month]}`} disabled={loadingRow !== null || isCreatingPartner || savingCompany !== null} onClick={() => saveRow(row)}>Salvar</button>
                      )) : !isEditing ? (
                        <button type="button" className={styles.actionButton} title="Editar percentual, tributacao, valores e observações" aria-label={`Editar valores e observações de ${row.partnerName}`} disabled={loadingRow !== null || isCreatingPartner || savingCompany !== null} onClick={() => toggleEdit(row, true)}><Pencil size={15} /></button>
                      ) : (
                        <div className="flex flex-wrap gap-1 justify-center">
                          {(row.partnerId > 0 || row.qsaId) && <button type="button" className={styles.actionButton}
                            title="Excluir sócio" aria-label={`Excluir sócio ${row.partnerName}`}
                            disabled={loadingRow !== null || isCreatingPartner || savingCompany !== null}
                            onClick={() => void deletePartner(row)}>
                            {isLoading ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
                          </button>}
                          <button type="button" className={styles.saveButton} title="Salvar meses alterados" aria-label="Salvar meses alterados" disabled={loadingRow !== null || isCreatingPartner || savingCompany !== null} onClick={() => saveRow(row)}>
                            {isLoading ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
                          </button>
                          <button type="button" className={styles.actionButton} aria-label="Cancelar todas as alterações" disabled={isLoading} onClick={() => cancelEdit(row)}><X size={15} /></button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })];
            })}
          </TableBody>
        </Table>
      </div>

      <nav aria-label="Paginas da tabela" className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
        <span>{filteredData.length === 0 ? 0 : pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredData.length)} de {filteredData.length} empresas</span>
        <div className="flex items-center gap-3">
          <button type="button" className="border rounded px-3 py-1 disabled:opacity-40" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
          <span>{currentPage} / {pageCount}</span>
          <button type="button" className="border rounded px-3 py-1 disabled:opacity-40" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Próxima</button>
        </div>
      </nav>
      <Dialog open={canCreatePartner && isModalOpen} onOpenChange={(open) => { if (!isCreatingPartner) setIsModalOpen(open); }}>
        <DialogPopup centered className="p-6" showCloseButton={!isCreatingPartner}>
          <DialogTitle>Adicionar sócio</DialogTitle>
          <DialogDescription className="mt-2">Cadastre o sócio na empresa e preencha os valores de cada mês na tabela.</DialogDescription>
          <form className="mt-4 flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void handleCreatePartner(); }}>
            <label className="flex flex-col gap-1 text-sm">Empresa
              <select required disabled={isCreatingPartner} className="w-full border rounded p-2" value={newPartner.companyCnpj} onChange={(event) => setNewPartner((prev) => ({ ...prev, companyCnpj: event.target.value }))}>
                <option value="">Selecione a empresa</option>
                {companies.map((company) => <option key={company.cnpj} value={company.cnpj}>{company.name} ({company.cnpj})</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">Nome do sócio
              <input required maxLength={200} disabled={isCreatingPartner} className="border rounded p-2" value={newPartner.partnerName} onChange={(event) => setNewPartner((prev) => ({ ...prev, partnerName: event.target.value }))} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" disabled={isCreatingPartner} className="border rounded px-3 py-2" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button type="submit" disabled={isCreatingPartner || !newPartner.partnerName.trim()} className="border rounded bg-primary text-primary-foreground px-3 py-2">{isCreatingPartner ? "Salvando..." : "Adicionar"}</button>
            </div>
          </form>
        </DialogPopup>
      </Dialog>
      <Dialog open={notice !== null} onOpenChange={(open) => { if (!open) setNotice(null); }}>
        <DialogPopup centered className="p-6">
          <DialogTitle>{notice?.kind === "error" ? "Não foi possível concluir" : "Concluído"}</DialogTitle>
          <DialogDescription className="mt-3 whitespace-pre-wrap">{notice?.text}</DialogDescription>
          <div className="mt-5 flex justify-end">
            <button type="button" className="rounded bg-primary px-4 py-2 text-primary-foreground" onClick={() => setNotice(null)}>OK</button>
          </div>
        </DialogPopup>
      </Dialog>
      <Dialog open={pendingYear !== null} onOpenChange={(open) => { if (!open) setPendingYear(null); }}>
        <DialogPopup centered className="p-6">
          <DialogTitle>Trocar de ano?</DialogTitle>
          <DialogDescription className="mt-3">Existem alterações não salvas. Deseja descartá-las e abrir {pendingYear}?</DialogDescription>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className="rounded border px-4 py-2" onClick={() => setPendingYear(null)}>Cancelar</button>
            <button type="button" className="rounded bg-primary px-4 py-2 text-primary-foreground" onClick={() => {
              if (pendingYear === null) return;
              const nextYear = pendingYear;
              setPendingYear(null);
              startYearTransition(() => router.push(`${pathname}?year=${nextYear}`));
            }}>Descartar e trocar</button>
          </div>
        </DialogPopup>
      </Dialog>
    </>
  );
}
