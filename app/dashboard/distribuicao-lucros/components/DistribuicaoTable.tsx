"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

import { useState } from "react";

type Row = {
  companyCnpj: string;
  companyName: string;

  partnerId: number;
  partnerName: string;

  participationPercentage?: number | null;
  amount?: number | null;
  status?: string;
  observation?: string;
};

type Props = {
  rows: Row[];
};

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// 💰 FORMAT
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

// 💰 INPUT MASK
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

// 🎨 STATUS
const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  NAO_ENCERRADO: {
    label: "Não encerrado",
    className: "bg-yellow-100 text-yellow-700 border-yellow-300",
  },
  ENCERRADO_COM_LUCRO: {
    label: "Encerrado com lucro",
    className: "bg-green-100 text-green-700 border-green-300",
  },
  ENCERRADO_COM_PREJUIZO: {
    label: "Encerrado com prejuízo",
    className: "bg-red-100 text-red-700 border-red-300",
  },
};

export function DistribuicaoTable({ rows }: Props) {
  const [data, setData] = useState(rows);
  const [editingRows, setEditingRows] = useState<Record<string, boolean>>({});
  const [originalRows, setOriginalRows] = useState<Record<string, Row>>({});
  const [loadingRow, setLoadingRow] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [newPartner, setNewPartner] = useState({
    companyCnpj: "",
    partnerName: "",
    participationPercentage: "",
    amount: "",
    status: "NAO_ENCERRADO",
    observation: "",
  });

  function getRowKey(row: Row) {
    return `${row.companyCnpj}-${row.partnerId}`;
  }

  // ✏️ inicia edição salvando snapshot
  function toggleEdit(row: Row, value: boolean) {
    const key = getRowKey(row);

    if (value) {
      setOriginalRows((prev) => ({
        ...prev,
        [key]: row,
      }));
    }

    setEditingRows((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  // ❌ cancelar edição
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
          ? { ...r, ...changes }
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
          status: row.status ?? "NAO_ENCERRADO",
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

      await fetch("/api/profit-distributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyCnpj: newPartner.companyCnpj,
          partnerId: partner.id,
          referenceDate: normalizeDate(new Date()),
          participationPercentage: Number(newPartner.participationPercentage),
          amount: parseCurrency(newPartner.amount),
          status: newPartner.status,
          observation: newPartner.observation,
        }),
      });

      setIsModalOpen(false);

    } catch (err) {
      console.error(err);
      alert("Erro ao criar sócio");
    }
  }

  return (
    <>
      {/* HEADER */}
      <div className="flex justify-end mb-3">
        <button
          className="px-3 py-2 text-sm border rounded-md hover:bg-muted"
          onClick={() => setIsModalOpen(true)}
        >
          + Sócio
        </button>
      </div>

      {/* TABELA */}
      <div className="w-full overflow-x-auto">
        <Table className="table-fixed w-full text-sm">

          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">#</TableHead>
              <TableHead className="w-[260px]">Empresa</TableHead>
              <TableHead className="w-[200px]">Sócio</TableHead>
              <TableHead className="w-[80px] text-center">%</TableHead>
              <TableHead className="w-[140px] text-right">Valor</TableHead>
              <TableHead className="w-[180px] text-center">Status</TableHead>
              <TableHead className="w-[220px]">Observação</TableHead>
              <TableHead className="w-[90px] text-center">Ações</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {data.map((row, index) => {
              const key = getRowKey(row);
              const isEditing = editingRows[key];
              const isLoading = loadingRow === key;
              const status = statusConfig[row.status ?? "NAO_ENCERRADO"];

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
                    {isEditing ? (
                      <select
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={row.status ?? "NAO_ENCERRADO"}
                        onChange={(e) =>
                          updateRow(row, { status: e.target.value })
                        }
                      >
                        <option value="NAO_ENCERRADO">Não encerrado</option>
                        <option value="ENCERRADO_COM_LUCRO">Enc. lucro</option>
                        <option value="ENCERRADO_COM_PREJUIZO">Enc. prejuízo</option>
                      </select>
                    ) : (
                      <span className={`px-2 py-1 text-xs rounded border ${status.className}`}>
                        {status.label}
                      </span>
                    )}
                  </TableCell>

                  <TableCell className="truncate">
                    {isEditing ? (
                      <input
                        className="w-full border rounded px-2 py-1 text-sm"
                        value={row.observation ?? ""}
                        onChange={(e) =>
                          updateRow(row, { observation: e.target.value })
                        }
                      />
                    ) : (
                      row.observation ?? "-"
                    )}
                  </TableCell>

                  <TableCell className="text-center">
                    {!isEditing ? (
                      <button onClick={() => toggleEdit(row, true)}>
                        ✏️
                      </button>
                    ) : (
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => saveRow(row)}>
                          {isLoading ? "..." : "💾"}
                        </button>
                        <button onClick={() => cancelEdit(row)}>
                          ❌
                        </button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>

        </Table>
      </div>

      {/* MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white p-6 rounded-lg w-[420px] space-y-4 shadow-xl">

            <h2 className="text-lg font-semibold">Novo Sócio</h2>

            <input
              placeholder="CNPJ"
              className="w-full border rounded px-3 py-2"
              value={newPartner.companyCnpj}
              onChange={(e) =>
                setNewPartner((p) => ({ ...p, companyCnpj: e.target.value }))
              }
            />

            <input
              placeholder="Nome do sócio"
              className="w-full border rounded px-3 py-2"
              value={newPartner.partnerName}
              onChange={(e) =>
                setNewPartner((p) => ({ ...p, partnerName: e.target.value }))
              }
            />

            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder="%"
                className="border rounded px-3 py-2"
                value={newPartner.participationPercentage}
                onChange={(e) =>
                  setNewPartner((p) => ({
                    ...p,
                    participationPercentage: e.target.value,
                  }))
                }
              />

              <input
                placeholder="Valor"
                className="border rounded px-3 py-2"
                value={newPartner.amount}
                onChange={(e) =>
                  setNewPartner((p) => ({
                    ...p,
                    amount: formatCurrencyInput(e.target.value),
                  }))
                }
              />
            </div>

            {/* 🔥 STATUS */}
            <select
              className="w-full border rounded px-3 py-2"
              value={newPartner.status}
              onChange={(e) =>
                setNewPartner((p) => ({ ...p, status: e.target.value }))
              }
            >
              <option value="NAO_ENCERRADO">Não encerrado</option>
              <option value="ENCERRADO_COM_LUCRO">Enc. lucro</option>
              <option value="ENCERRADO_COM_PREJUIZO">Enc. prejuízo</option>
            </select>

            {/* 🔥 OBS */}
            <input
              placeholder="Observação"
              className="w-full border rounded px-3 py-2"
              value={newPartner.observation}
              onChange={(e) =>
                setNewPartner((p) => ({ ...p, observation: e.target.value }))
              }
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-3 py-2 border rounded hover:bg-gray-100"
                onClick={() => setIsModalOpen(false)}
              >
                Cancelar
              </button>

              <button
                className="px-3 py-2 border rounded bg-green-100 hover:bg-green-200"
                onClick={handleCreatePartner}
              >
                Salvar
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}