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

// 💰 formatadores
function formatCurrency(value?: number | null) {
  if (value === null || value === undefined) return "-";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatPercentage(value?: number | null) {
  if (value === null || value === undefined) return "-";
  return `${value}%`;
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
  const [loadingRow, setLoadingRow] = useState<string | null>(null);

  // 🔥 MODAL
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

  function toggleEdit(row: Row, value: boolean) {
    const key = getRowKey(row);

    setEditingRows((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function updateRow(row: Row, changes: Partial<Row>) {
    setData((prev) =>
      prev.map((r) =>
        r.companyCnpj === row.companyCnpj &&
        r.partnerId === row.partnerId
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
      alert("Erro ao salvar linha");
    } finally {
      setLoadingRow(null);
    }
  }

  async function handleCreatePartner() {
    try {
      const partnerRes = await fetch("/api/profit-distributions/partners", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyCnpj: newPartner.companyCnpj,
          name: newPartner.partnerName,
        }),
      });

      const partner = await partnerRes.json();

      await fetch("/api/profit-distributions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          companyCnpj: newPartner.companyCnpj,
          partnerId: partner.id,
          referenceDate: normalizeDate(new Date()),

          participationPercentage: Number(newPartner.participationPercentage),
          amount: Number(newPartner.amount),
          status: newPartner.status,
          observation: newPartner.observation,
        }),
      });

      setData((prev) => [
        ...prev,
        {
          companyCnpj: newPartner.companyCnpj,
          companyName: "Nova empresa",
          partnerId: partner.id,
          partnerName: newPartner.partnerName,
          participationPercentage: Number(newPartner.participationPercentage),
          amount: Number(newPartner.amount),
          status: newPartner.status,
          observation: newPartner.observation,
        },
      ]);

      setIsModalOpen(false);

    } catch (err) {
      console.error(err);
      alert("Erro ao criar sócio");
    }
  }

  return (
    <>
      {/* 🔥 AÇÕES */}
      <div className="flex justify-end gap-2 mb-3">
        <button
          className="px-3 py-2 text-sm border rounded-md hover:bg-muted"
          onClick={() => setIsModalOpen(true)}
        >
          + Sócio
        </button>
      </div>

      <Table className="table-fixed w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">#</TableHead>
            <TableHead className="w-[260px]">Empresa</TableHead>
            <TableHead className="w-[180px]">Sócio</TableHead>
            <TableHead className="w-[90px]">%</TableHead>
            <TableHead className="w-[130px]">Valor</TableHead>
            <TableHead className="w-[200px]">Status</TableHead>
            <TableHead className="w-[280px]">Observação</TableHead>
            <TableHead className="w-[110px]">Ações</TableHead>
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

                <TableCell className="truncate" title={row.companyName}>
                  {row.companyName}
                </TableCell>

                <TableCell className="truncate" title={row.partnerName}>
                  {row.partnerName}
                </TableCell>

                <TableCell>
                  {isEditing ? (
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
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

                <TableCell>
                  {isEditing ? (
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      value={row.amount ?? ""}
                      onChange={(e) =>
                        updateRow(row, {
                          amount: Number(e.target.value),
                        })
                      }
                    />
                  ) : (
                    formatCurrency(row.amount)
                  )}
                </TableCell>

                <TableCell>
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
                        updateRow(row, {
                          observation: e.target.value,
                        })
                      }
                    />
                  ) : (
                    row.observation ?? "-"
                  )}
                </TableCell>

                <TableCell>
                  {!isEditing ? (
                    <button
                      className="w-full px-2 py-1 border rounded hover:bg-blue-100"
                      onClick={() => toggleEdit(row, true)}
                    >
                      ✏️
                    </button>
                  ) : (
                    <div className="flex gap-1">
                      <button
                        className="flex-1 px-2 py-1 border rounded hover:bg-green-100"
                        onClick={() => saveRow(row)}
                        disabled={isLoading}
                      >
                        {isLoading ? "..." : "💾"}
                      </button>

                      <button
                        className="flex-1 px-2 py-1 border rounded hover:bg-red-100"
                        onClick={() => toggleEdit(row, false)}
                      >
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

      {/* 🔥 MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">

          <div className="bg-white w-[500px] rounded-lg p-6 shadow-xl space-y-4">

            <h2 className="text-lg font-bold">Novo Sócio</h2>

            <input
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="CNPJ"
              value={newPartner.companyCnpj}
              onChange={(e) =>
                setNewPartner((p) => ({ ...p, companyCnpj: e.target.value }))
              }
            />

            <input
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="Nome do sócio"
              value={newPartner.partnerName}
              onChange={(e) =>
                setNewPartner((p) => ({ ...p, partnerName: e.target.value }))
              }
            />

            <div className="grid grid-cols-2 gap-3">
              <input
                className="border rounded px-3 py-2 text-sm"
                placeholder="%"
                value={newPartner.participationPercentage}
                onChange={(e) =>
                  setNewPartner((p) => ({ ...p, participationPercentage: e.target.value }))
                }
              />

              <input
                className="border rounded px-3 py-2 text-sm"
                placeholder="Valor"
                value={newPartner.amount}
                onChange={(e) =>
                  setNewPartner((p) => ({ ...p, amount: e.target.value }))
                }
              />
            </div>

            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={newPartner.status}
              onChange={(e) =>
                setNewPartner((p) => ({ ...p, status: e.target.value }))
              }
            >
              <option value="NAO_ENCERRADO">Não encerrado</option>
              <option value="ENCERRADO_COM_LUCRO">Enc. lucro</option>
              <option value="ENCERRADO_COM_PREJUIZO">Enc. prejuízo</option>
            </select>

            <input
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="Observação"
              value={newPartner.observation}
              onChange={(e) =>
                setNewPartner((p) => ({ ...p, observation: e.target.value }))
              }
            />

            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-2 border rounded"
                onClick={() => setIsModalOpen(false)}
              >
                Cancelar
              </button>

              <button
                className="px-3 py-2 border rounded bg-green-100"
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