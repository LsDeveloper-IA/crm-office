"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronRight, Pencil, Check, X, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { hasDistributionChanges, isValidDistributionNumber, normalizeDistributionSearch } from "@/lib/profit-distribution-input";
import styles from "./DistribuicaoTable.module.css";
import { ProfitDistributionStatus } from "@prisma/client";
import {
  PROFIT_DISTRIBUTION_STATUS_CONFIG,
  PROFIT_DISTRIBUTION_STATUS_OPTIONS,
} from "@/lib/profit-distribution-status";

import { DIVIDEND_TAXATION_OPTIONS, getMajorityDividendTaxation, isDividendTaxation, type DividendTaxationValue } from "@/lib/dividend-taxation";

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
  month?: number;
  monthlyDistributions?: MonthlyDistribution[];
  companyCnpj: string;
  companyName: string;
  partnerId: number;
  partnerName: string;
  participationPercentage?: number | null;
  dividendTaxation?: DividendTaxationValue | null;
  amount?: number | null;
  status: ProfitDistributionStatus;
  observation?: string;
};

type Props = {
  rows: Row[];
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

function formatPercentage(value?: number | null) {
  if (value == null) return "-";
  return `${value}%`;
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

export function DistribuicaoTable({ rows, year, years, canCreatePartner }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChangingYear, startYearTransition] = useTransition();
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [data, setData] = useState<Row[]>(() => rows.flatMap((row) => [
    normalizeRow(row),
    ...MONTHS.map((_, month) => normalizeRow({
      ...row,
      participationPercentage: null,
      dividendTaxation: null,
      amount: null,
      status: DEFAULT_STATUS,
      observation: "",
      ...row.monthlyDistributions?.find((distribution) => distribution.month === month),
      month,
    })),
  ]));
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    ProfitDistributionStatus | ""
  >("");

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

  const { summaries, monthsByGroup, totalsInCents } = useMemo(() => indexRows(data), [data]);
  const filteredData = useMemo(() => {
    const term = normalizeDistributionSearch(search);
    const cnpjTerm = search.replace(/\D/g, "");
    return summaries.filter((row) => {
      const matchSearch = normalizeDistributionSearch(row.companyName).includes(term)
        || normalizeDistributionSearch(row.partnerName).includes(term)
        || (cnpjTerm.length > 0 && row.companyCnpj.includes(cnpjTerm));
      return matchSearch && (!statusFilter || row.status === statusFilter);
    });
  }, [summaries, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleData = filteredData.slice(pageStart, pageStart + PAGE_SIZE);

  const dirtyKeys = useMemo(() => new Set(data
    .filter((row) => row.month != null && originalRows[getRowKey(row)]
      && editingRows[groupKey(row)] && hasDistributionChanges(row, originalRows[getRowKey(row)]))
    .map(getRowKey)), [data, originalRows, editingRows]);
  const companies = useMemo(() => Array.from(new Map(summaries.map((row) =>
    [row.companyCnpj, { cnpj: row.companyCnpj, name: row.companyName }])).values()), [summaries]);
  useEffect(() => {
    if (!dirtyKeys.size) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirtyKeys.size]);

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
    if (row.month == null && changes.participationPercentage !== undefined) {
      setData((prev) => prev.map((item) => groupKey(item) === groupKey(row)
        ? { ...item, participationPercentage: changes.participationPercentage }
        : item));
      return;
    }
    if (row.month == null) {
      changes = {
        ...(changes.observation !== undefined ? { observation: changes.observation } : {}),
        ...(changes.dividendTaxation !== undefined ? { dividendTaxation: changes.dividendTaxation } : {}),
      };
    }
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
      const originalSummary = originalRows[key];
      const percentageChanged = summary && originalSummary
        && (summary.participationPercentage ?? null) !== (originalSummary.participationPercentage ?? null);
      const changedMonths = (monthsByGroup.get(key) ?? []).filter((item) => {
        if (item.month == null || (!percentageChanged && row.month != null && item.month !== row.month)) return false;
        if (percentageChanged) return dirtyKeys.has(getRowKey(item));
        if (row.month != null) return true;
        return dirtyKeys.has(getRowKey(item));
      });
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

  return (
    <>
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between mb-3 gap-3">
        <label className="flex items-center gap-2 text-sm">
          Ano de referência
          <select
            className="border rounded px-3 py-2"
            value={year}
            disabled={isChangingYear || loadingRow !== null || isCreatingPartner}
            onChange={(event) => {
              const nextYear = event.target.value;
              if (dirtyKeys.size > 0) { setPendingYear(nextYear); return; }
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

        <div className="flex flex-wrap items-center gap-2">
          {/* 🔥 SELECT CORRIGIDO */}
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

          {canCreatePartner && <button
            className="px-3 py-2 text-sm border rounded-md hover:bg-muted whitespace-nowrap"
            disabled={isCreatingPartner || loadingRow !== null}
            onClick={() => { setNotice(null); setIsModalOpen(true); }}
          >
            + Sócio
          </button>}
        </div>
      </div>

      {dirtyKeys.size > 0 && <p className="mb-3 text-sm text-amber-800" role="status">{dirtyKeys.size} mês(es) com alterações não salvas.</p>}
      {(search || statusFilter) && <button type="button" className="mb-3 text-sm underline" onClick={() => { setSearch(""); setStatusFilter(""); setPage(1); }}>Limpar filtros</button>}
      {/* TABELA */}
      <div className={styles.container}>
        <Table className={`${styles.table} table-fixed w-full text-sm`}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[3%]">#</TableHead>
              <TableHead className="w-[17%]">Empresa</TableHead>
              <TableHead className="w-[14%]">Sócio</TableHead>
              <TableHead className="w-[8%] text-center">%</TableHead>
              <TableHead className="w-[13%] text-center">Tributação de Dividendos</TableHead>
              <TableHead className="w-[12%] text-right">Valor</TableHead>
              <TableHead className="w-[13%] text-center">Status</TableHead>
              <TableHead className="w-[13%]">Observação</TableHead>
              <TableHead className="w-[7%] text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {visibleData.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-6">Nenhum resultado encontrado.</TableCell></TableRow>
            )}
            {visibleData.flatMap((parent, index) => [
              { row: parent, index },
              ...(expandedRows[getRowKey(parent)] ? (monthsByGroup.get(groupKey(parent)) ?? [])
                .map((row) => ({ row, index })) : []),
            ]).map(({ row, index }) => {
              const key = getRowKey(row);
              const isEditing = editingRows[groupKey(row)];
              const isLoading = loadingRow === groupKey(row);
              const isMonthlyEditing = isEditing && row.month != null;
              const displayedAmount = row.month == null
                ? (totalsInCents.get(groupKey(row)) ?? 0) / 100
                : row.amount;
              const majorityTaxation = row.month == null
                ? getMajorityDividendTaxation(monthsByGroup.get(groupKey(row)) ?? [])
                : "";

              const status =
                PROFIT_DISTRIBUTION_STATUS_CONFIG[row.status!];

              return (
                <TableRow key={key} className={row.month != null ? styles.monthRow : styles.summaryRow} data-editing={isEditing || undefined} data-dirty={dirtyKeys.has(key) || undefined}>
                  {row.month != null ? (
                    <TableCell data-label="Mês" colSpan={3} className={styles.monthCell}><div className={styles.monthLabel}><span className={styles.monthNumber}>{String(row.month + 1).padStart(2, "0")}</span><span>{MONTHS[row.month]}</span>{dirtyKeys.has(key) && <span className={styles.unsaved}>Não salvo</span>}</div></TableCell>
                  ) : (
                    <>
                      <TableCell data-label="#">{pageStart + index + 1}</TableCell>
                      <TableCell data-label="Empresa">
                        <div className="flex min-w-0 items-center gap-2">
                          <button
                            type="button"
                            className={styles.expandButton}
                            aria-expanded={!!expandedRows[key]}
                            aria-label={`${expandedRows[key] ? "Recolher" : "Expandir"} meses de ${row.companyName}, ${row.partnerName}`}
                            onClick={() => setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }))}
                          >
                            {expandedRows[key] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                          <div className="min-w-0"><span className={styles.companyName} title={row.companyName}>{row.companyName}</span><span className={styles.summaryCaption}>Resumo anual · {year}</span></div>
                        </div>
                      </TableCell>
                      <TableCell data-label="Sócio">{row.partnerName}</TableCell>
                    </>
                  )}

                  <TableCell data-label={row.month == null ? "%" : undefined} data-empty={row.month != null ? "true" : undefined} className="text-center">
                    {row.month != null ? null : isEditing ? (
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={3}
                        aria-label={`Porcentagem de ${row.partnerName} em ${year}`}
                        title="Digite um numero inteiro de 0 a 100. Aplicado a todos os meses deste socio."
                        disabled={isLoading}
                        className={styles.percentageInput}
                        value={row.participationPercentage ?? ""}
                        onKeyDown={(event) => {
                          if (event.key.length === 1 && !/^[0-9]$/.test(event.key)
                            && !event.ctrlKey && !event.metaKey) event.preventDefault();
                        }}
                        onPaste={(event) => {
                          const pasted = event.clipboardData.getData("text");
                          if (!/^[0-9]+$/.test(pasted) || Number(pasted) > 100) {
                            event.preventDefault();
                          }
                        }}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (!/^[0-9]*$/.test(value) || Number(value) > 100) return;
                          updateRow(row, {
                            participationPercentage: value === "" ? null : Number(value),
                          });
                        }}
                      />
                    ) : (
                      formatPercentage(row.participationPercentage)
                    )}
                  </TableCell>

                  <TableCell data-label="Tributação de Dividendos" className="text-center">
                    {row.month == null ? (
                      <span title="Opção mais selecionada nos meses">
                        {DIVIDEND_TAXATION_OPTIONS.find((option) => option.value === majorityTaxation)?.label
                          ?? (majorityTaxation === "EMPATE" ? "Empate" : "--")}
                      </span>
                    ) : isMonthlyEditing ? (
                      <select
                        disabled={isLoading}
                        className="w-full border rounded px-2 py-1 disabled:opacity-100"
                        aria-label={`Tributação de Dividendos de ${MONTHS[row.month]}, ${row.partnerName}`}
                        value={row.dividendTaxation ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (!isMonthlyEditing || (value !== "" && !isDividendTaxation(value))) return;
                          updateRow(row, { dividendTaxation: value === "" ? null : value as DividendTaxationValue });
                        }}
                      >
                        <option value="">--</option>
                        {DIVIDEND_TAXATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : (
                      DIVIDEND_TAXATION_OPTIONS.find((option) => option.value === row.dividendTaxation)?.label ?? "--"
                    )}
                  </TableCell>

                  <TableCell data-label="Valor" className={`text-right tabular-nums ${row.month == null ? styles.annualAmount : styles.monthAmount}`}>
                    {isMonthlyEditing ? (
                      <input
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

                  <TableCell data-label="Status" className="text-center">
                    {isMonthlyEditing ? (
                      <select
                        disabled={isLoading}
                        className="w-full border rounded px-2 py-1"
                        value={row.status}
                        onChange={(e) =>
                          updateRow(row, {
                            status: e.target.value as ProfitDistributionStatus,
                          })
                        }
                      >
                        {PROFIT_DISTRIBUTION_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.shortLabel}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={styles.statusBadge} data-status={row.status}>
                        {status.label}
                      </span>
                    )}
                  </TableCell>

                  <TableCell data-label="Observação">
                    {isMonthlyEditing ? (
                      <input
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
                      <button type="button" className={styles.monthSaveButton} title={`Salvar ${MONTHS[row.month]}`} aria-label={`Salvar ${MONTHS[row.month]}`} disabled={loadingRow !== null || isCreatingPartner} onClick={() => saveRow(row)}>Salvar</button>
                    )) : !isEditing ? (
                      <button type="button" className={styles.actionButton} title="Editar" aria-label="Editar" onClick={() => toggleEdit(row, true)}><Pencil size={15} /></button>
                    ) : (
                      <div className="flex flex-wrap gap-1 justify-center">
                        <button type="button" className={styles.saveButton} title="Salvar meses alterados" aria-label="Salvar meses alterados" disabled={loadingRow !== null || isCreatingPartner} onClick={() => saveRow(row)}>
                          {isLoading ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
                        </button>
                        <button type="button" className={styles.actionButton} aria-label="Cancelar todas as alterações" disabled={isLoading} onClick={() => cancelEdit(row)}><X size={15} /></button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <nav aria-label="Paginas da tabela" className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
        <span>{filteredData.length === 0 ? 0 : pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredData.length)} de {filteredData.length} registros</span>
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
