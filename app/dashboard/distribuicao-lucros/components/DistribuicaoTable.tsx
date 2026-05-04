"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import { ProfitDistributionStatus } from "@prisma/client";
import {
  normalizeProfitDistributionStatus,
  PROFIT_DISTRIBUTION_STATUS_CONFIG,
  PROFIT_DISTRIBUTION_STATUS_OPTIONS,
} from "@/lib/profit-distribution-status";

type Row = {
  companyCnpj: string;
  companyName: string;
  partnerId: number;
  partnerName: string;
  participationPercentage?: number | null;
  amount?: number | null;
  status: ProfitDistributionStatus;
  observation?: string;
};

type Props = {
  rows: Row[];
};

type NewPartnerState = {
  companyCnpj: string;
  partnerName: string;
  participationPercentage: string;
  amount: string;
  status: ProfitDistributionStatus;
  observation: string;
};

const DEFAULT_STATUS = ProfitDistributionStatus.NAO_ENCERRADO;

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function normalizeRow(row: Row): Row {
  return {
    ...row,
    status: row.status ?? ProfitDistributionStatus.NAO_ENCERRADO,
  };
}

function createDefaultNewPartner(): NewPartnerState {
  return {
    companyCnpj: "",
    partnerName: "",
    participationPercentage: "",
    amount: "",
    status: DEFAULT_STATUS,
    observation: "",
  };
}

function getRowKey(row: Row) {
  return `${row.companyCnpj}-${row.partnerId}`;
}

function formatCurrency(value?: number | null) {
  if (value == null) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
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

  return number.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
  });
}

export function DistribuicaoTable({ rows }: Props) {
  const [data, setData] = useState<Row[]>(() => rows.map(normalizeRow));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    ProfitDistributionStatus | ""
  >("");

  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});
  const [originalRows, setOriginalRows] = useState<Record<string, Row>>({});
  const [loadingRow, setLoadingRow] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPartner, setNewPartner] = useState<NewPartnerState>(
    createDefaultNewPartner()
  );

  // ✅ FILTRO CORRIGIDO
  const filteredData = data.filter((row) => {
    const term = search.toLowerCase();

    const matchSearch =
      row.companyName.toLowerCase().includes(term) ||
      row.partnerName.toLowerCase().includes(term) ||
      row.companyCnpj.includes(term);

    const matchStatus =
    !statusFilter || row.status === statusFilter;

    return matchSearch && matchStatus;
  });

  function toggleEdit(row: Row, value: boolean) {
    const key = getRowKey(row);

    if (value) {
      setOriginalRows((prev) => ({
        ...prev,
        [key]: normalizeRow(row),
      }));
    }

    setEditingRows((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function cancelEdit(row: Row) {
    const key = getRowKey(row);
    const original = originalRows[key];

    if (original) {
      setData((prev) =>
        prev.map((r) =>
          getRowKey(r) === key ? original : r
        )
      );
    }

    toggleEdit(row, false);
  }

  function updateRow(row: Row, changes: Partial<Row>) {
    setData((prev) =>
      prev.map((r) =>
        getRowKey(r) === getRowKey(row)
          ? normalizeRow({ ...r, ...changes })
          : r
      )
    );
  }

  async function saveRow(row: Row) {
    const key = getRowKey(row);
    setLoadingRow(key);

    try {
      let partnerId = row.partnerId;

      if (partnerId <= 0) {
        const res = await fetch("/api/profit-distributions/partners", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyCnpj: row.companyCnpj,
            name: row.partnerName,
          }),
        });

        const partner = await res.json();
        partnerId = partner.id;
      }

      await fetch("/api/profit-distributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCnpj: row.companyCnpj,
          partnerId,
          referenceDate: normalizeDate(new Date()),
          participationPercentage: Number(row.participationPercentage ?? 0),
          amount: Number(row.amount ?? 0),
          status: row.status,
          observation: row.observation ?? "",
        }),
      });

      toggleEdit(row, false);
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar");
    } finally {
      setLoadingRow(null);
    }
  }

  async function handleCreatePartner() {
    try {
      const partnerRes = await fetch("/api/profit-distributions/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCnpj: newPartner.companyCnpj,
          name: newPartner.partnerName,
        }),
      });

      const partner = await partnerRes.json();
      const referenceDate = normalizeDate(new Date());

      await fetch("/api/profit-distributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCnpj: newPartner.companyCnpj,
          partnerId: partner.id,
          referenceDate,
          participationPercentage: Number(newPartner.participationPercentage),
          amount: parseCurrency(newPartner.amount),
          status: newPartner.status,
          observation: newPartner.observation,
        }),
      });

      setData((prev) => [
        ...prev,
        normalizeRow({
          companyCnpj: newPartner.companyCnpj,
          companyName: newPartner.companyCnpj,
          partnerId: partner.id,
          partnerName: newPartner.partnerName,
          participationPercentage: Number(newPartner.participationPercentage),
          amount: parseCurrency(newPartner.amount),
          status: newPartner.status,
          observation: newPartner.observation,
        }),
      ]);

      setNewPartner(createDefaultNewPartner());
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      alert("Erro ao criar sócio");
    }
  }

  return (
    <>
      {/* HEADER */}
      <div className="flex items-center justify-between mb-3 gap-3">
        <input
          placeholder="Buscar empresa, sócio ou CNPJ..."
          className="w-full max-w-md border rounded px-3 py-2 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="flex items-center gap-2">
          {/* 🔥 SELECT CORRIGIDO */}
          <select
            className="border rounded px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as ProfitDistributionStatus | ""
              )
            }
          >
            <option value="">Todos status</option>
            {PROFIT_DISTRIBUTION_STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>
                {status.shortLabel}
              </option>
            ))}
          </select>

          <button
            className="px-3 py-2 text-sm border rounded-md hover:bg-muted whitespace-nowrap"
            onClick={() => setIsModalOpen(true)}
          >
            + Sócio
          </button>
        </div>
      </div>

      {/* TABELA */}
      <div className="w-full overflow-x-auto">
        <Table className="table-fixed w-full text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30px]">#</TableHead>
              <TableHead className="w-[260px]">Empresa</TableHead>
              <TableHead className="w-[200px]">Sócio</TableHead>
              <TableHead className="w-[60px] text-center">%</TableHead>
              <TableHead className="w-[120px] text-right">Valor</TableHead>
              <TableHead className="w-[180px] text-center">Status</TableHead>
              <TableHead className="w-[220px]">Observação</TableHead>
              <TableHead className="w-[90px] text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filteredData.map((row, index) => {
              const key = getRowKey(row);
              const isEditing = editingRows[key];
              const isLoading = loadingRow === key;

              const status =
                PROFIT_DISTRIBUTION_STATUS_CONFIG[row.status!];

              return (
                <TableRow key={key}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell className="truncate">{row.companyName}</TableCell>
                  <TableCell className="truncate">{row.partnerName}</TableCell>

                  <TableCell className="text-center">
                    {isEditing ? (
                      <input
                        className="w-full border rounded px-2 py-1"
                        value={row.participationPercentage ?? ""}
                        onChange={(e) =>
                          updateRow(row, {
                            participationPercentage: Number(e.target.value),
                          })
                        }
                      />
                    ) : (
                      formatPercentage(row.participationPercentage)
                    )}
                  </TableCell>

                  <TableCell className="text-right">
                    {isEditing ? (
                      <input
                        className="w-full border rounded px-2 py-1"
                        defaultValue={
                          row.amount != null
                            ? formatCurrency(row.amount).replace("R$ ", "")
                            : ""
                        }
                        onChange={(e) => {
                          const masked = formatCurrencyInput(e.target.value);
                          e.target.value = masked;

                          updateRow(row, {
                            amount: parseCurrency(masked),
                          });
                        }}
                      />
                    ) : (
                      formatCurrency(row.amount)
                    )}
                  </TableCell>

                  <TableCell className="text-center">
                    <span className={`px-2 py-1 text-xs rounded border ${status.className}`}>
                      {status.label}
                    </span>
                  </TableCell>

                  <TableCell className="truncate">
                    {row.observation ?? "-"}
                  </TableCell>

                  <TableCell className="text-center">
                    {!isEditing ? (
                      <button onClick={() => toggleEdit(row, true)}>✏️</button>
                    ) : (
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => saveRow(row)}>
                          {isLoading ? "..." : "💾"}
                        </button>
                        <button onClick={() => cancelEdit(row)}>❌</button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* MODAL permanece igual */}
    </>
  );
}