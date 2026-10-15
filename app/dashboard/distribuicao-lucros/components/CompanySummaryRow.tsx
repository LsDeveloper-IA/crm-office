"use client";

import { Check, ChevronDown, ChevronRight, LoaderCircle, Pencil, X } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { PROFIT_DISTRIBUTION_STATUS_CONFIG, PROFIT_DISTRIBUTION_STATUS_OPTIONS } from "@/lib/profit-distribution-status";
import type { ProfitCompanySettings } from "@/lib/profit-company-settings";
import { formatCapital } from "@/lib/ownership-money";
import styles from "./DistribuicaoTable.module.css";

type Props = {
  name: string; cnpj: string; year: number; index: number; total: string; percentage: number | null;
  capitalCents: string | null;
  settings: ProfitCompanySettings; caseAsideLocked?: boolean; expanded: boolean; editing: boolean; busy: boolean; saving: boolean;
  onToggle: () => void; onEdit: () => void; onSave: () => void; onCancel: () => void;
  onChange: (changes: Partial<ProfitCompanySettings>) => void;
  onToggleCaseAside: () => void;
  failureReason?: string;
  failureReasonOptions?: string[];
  onChangeFailureReason?: (reason: string) => void;
};

const FAILURE_REASON_LABELS: Record<string, string> = {
  "case-aside": "Casos a parte",
  "__partners__": "Com sócios",
  "without-documents": "Sem docs",
  "without-drive-folder": "Sem Drive",
  "skip-no-importable-ownership-history": "Sem histórico",
  "needs-review-ambiguous-partner-link": "Vínculo ambíguo",
  "failed": "Falha",
  "needs-review-policy": "Revisão manual",
  "skip-instructed": "Ignorada",
};

export function CompanySummaryRow(p: Props) {
  return (
    <TableRow className={styles.summaryRow} data-editing={p.editing || undefined}>
      <TableCell data-label="#">{p.index}</TableCell>
      <TableCell data-label="Empresa" className={styles.companyCell} colSpan={2}>
        <div className={styles.companyLayout}>
          <button type="button" className={styles.expandButton} aria-expanded={p.expanded}
            aria-label={`${p.expanded ? "Recolher" : "Expandir"} sócios de ${p.name}`} onClick={p.onToggle}>
            {p.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <div className={styles.companyHeading}>
            <span className={styles.companyName}>{p.name}</span>
            <span className={styles.summaryCaption}>{p.cnpj} · Ano {p.year}</span>
          </div>
        </div>

        <div className={styles.metaRow}>
          {p.settings.caseAside && <span className={styles.caseAsideBadge}>Caso à parte</span>}

          {p.failureReasonOptions && p.failureReasonOptions.length > 0 && p.onChangeFailureReason && (
            <label className={styles.filterControl}>
              <span>Filtro</span>
              <select
                aria-label={`Alterar filtro de falha de ${p.name}`}
                className={styles.filterSelect}
                value={p.failureReason ?? ""}
                onChange={(e) => p.onChangeFailureReason?.(e.target.value)}
              >
                <option value="">Nenhum</option>
                {p.failureReasonOptions.map((reason) => (
                  <option key={reason} value={reason}>{FAILURE_REASON_LABELS[reason] ?? reason}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </TableCell>
      <TableCell data-label="Capital Social" className={styles.capitalCell}>{formatCapital(p.capitalCents)}</TableCell>
      <TableCell data-label="%" className={styles.percentageCell}>
        {p.percentage == null ? "--" : `${p.percentage.toLocaleString("pt-BR")}%`}
      </TableCell>
      <TableCell data-empty="true" />
      <TableCell data-label="Valor total" className={styles.totalCell}>{p.total}</TableCell>
      <TableCell data-label="Status" className={styles.statusCell}>
        {p.editing ? <select className="w-full border rounded px-2 py-1" disabled={p.busy}
          aria-label={`Status da empresa ${p.name}`} value={p.settings.status}
          onChange={(e) => p.onChange({ status: e.target.value as ProfitCompanySettings["status"] })}>
          {PROFIT_DISTRIBUTION_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.shortLabel}</option>)}
        </select> : <span className={styles.statusBadge} data-status={p.settings.status}>{PROFIT_DISTRIBUTION_STATUS_CONFIG[p.settings.status].label}</span>}
      </TableCell>
      <TableCell data-label="Observação" className={styles.observationCell}>
        {p.editing ? <input className="w-full border rounded px-2 py-1" disabled={p.busy} maxLength={5000}
          aria-label={`Observação da empresa ${p.name}`} value={p.settings.observation}
          onChange={(e) => p.onChange({ observation: e.target.value })} />
          : <span>{p.settings.observation || "--"}</span>}
      </TableCell>
      <TableCell data-label="Ações" className={styles.actionsCell}>
        {p.editing ? <div className={styles.inlineActions}>
          <button type="button" className={styles.saveButton} disabled={p.busy} aria-label={`Salvar empresa ${p.name}`} onClick={p.onSave}>
            {p.saving ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
          </button>
          <button type="button" className={styles.actionButton} disabled={p.busy} aria-label={`Cancelar edição da empresa ${p.name}`} onClick={p.onCancel}><X size={15} /></button>
        </div> : <button type="button" className={styles.actionButton} disabled={p.busy} aria-label={`Editar empresa ${p.name}`} title="Editar empresa" onClick={p.onEdit}><Pencil size={15} /></button>}
      </TableCell>
    </TableRow>
  );
}
