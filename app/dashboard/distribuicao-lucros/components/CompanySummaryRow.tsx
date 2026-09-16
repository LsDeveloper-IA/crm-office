"use client";

import { Check, ChevronDown, ChevronRight, LoaderCircle, Pencil, X } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { PROFIT_DISTRIBUTION_STATUS_CONFIG, PROFIT_DISTRIBUTION_STATUS_OPTIONS } from "@/lib/profit-distribution-status";
import type { ProfitCompanySettings } from "@/lib/profit-company-settings";
import styles from "./DistribuicaoTable.module.css";

type Props = {
  name: string; cnpj: string; year: number; index: number; total: string; percentage: number;
  settings: ProfitCompanySettings; expanded: boolean; editing: boolean; busy: boolean; saving: boolean;
  onToggle: () => void; onEdit: () => void; onSave: () => void; onCancel: () => void;
  onChange: (changes: Partial<ProfitCompanySettings>) => void;
};

export function CompanySummaryRow(p: Props) {
  return (
    <TableRow className={styles.summaryRow} data-editing={p.editing || undefined}>
      <TableCell data-label="#">{p.index}</TableCell>
      <TableCell data-label="Empresa" colSpan={2}>
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" className={styles.expandButton} aria-expanded={p.expanded}
            aria-label={`${p.expanded ? "Recolher" : "Expandir"} sócios de ${p.name}`} onClick={p.onToggle}>
            {p.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <div className="min-w-0">
            <span className={styles.companyName}>{p.name}</span>
            <span className={styles.summaryCaption}>{p.cnpj} · Resumo anual · {p.year}</span>
          </div>
        </div>
      </TableCell>
      <TableCell data-label="%" className="text-center">
        {p.percentage}%
      </TableCell>
      <TableCell data-empty="true" />
      <TableCell data-label="Valor total" className={`text-right tabular-nums ${styles.annualAmount}`}>{p.total}</TableCell>
      <TableCell data-label="Status" className="text-center">
        {p.editing ? <select className="w-full border rounded px-2 py-1" disabled={p.busy}
          aria-label={`Status da empresa ${p.name}`} value={p.settings.status}
          onChange={(e) => p.onChange({ status: e.target.value as ProfitCompanySettings["status"] })}>
          {PROFIT_DISTRIBUTION_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.shortLabel}</option>)}
        </select> : <span className={styles.statusBadge} data-status={p.settings.status}>{PROFIT_DISTRIBUTION_STATUS_CONFIG[p.settings.status].label}</span>}
      </TableCell>
      <TableCell data-label="Observação">
        {p.editing ? <input className="w-full border rounded px-2 py-1" disabled={p.busy} maxLength={5000}
          aria-label={`Observação da empresa ${p.name}`} value={p.settings.observation}
          onChange={(e) => p.onChange({ observation: e.target.value })} />
          : <span className={styles.observation}>{p.settings.observation || "--"}</span>}
      </TableCell>
      <TableCell data-label="Ações" className="text-center">
        {p.editing ? <div className="flex flex-wrap gap-1 justify-center">
          <button type="button" className={styles.saveButton} disabled={p.busy} aria-label={`Salvar empresa ${p.name}`} onClick={p.onSave}>
            {p.saving ? <LoaderCircle size={15} className="animate-spin" /> : <Check size={15} />}
          </button>
          <button type="button" className={styles.actionButton} disabled={p.busy} aria-label={`Cancelar edição da empresa ${p.name}`} onClick={p.onCancel}><X size={15} /></button>
        </div> : <button type="button" className={styles.actionButton} disabled={p.busy} aria-label={`Editar empresa ${p.name}`} title="Editar empresa" onClick={p.onEdit}><Pencil size={15} /></button>}
      </TableCell>
    </TableRow>
  );
}
