"use client";

import { useTaxRegimes } from "@/app/dashboard/empresas/hooks/useTaxRegimes";
import { useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  sectors: { id: string; name: string }[];
};

export function NewCompanyModal({
  open,
  onClose,
  onCreated,
  sectors,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    cnpj: "",
    taxRegime: "",
    accountant: "",
    email: "",
    phone: "",
    companySectors: [{ sectorId: "" }],
  });
  
  const {
    taxRegimes,
    loading: loadingTaxRegimes,
  } = useTaxRegimes();

  if (!open) return null;

  function update<K extends keyof typeof form>(
    key: K,
    value: string
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addSector() {
    setForm((prev) => ({
      ...prev,
      companySectors: [...prev.companySectors, { sectorId: "" }],
    }));
  }

  function removeSector(index: number) {
    setForm((prev) => ({
      ...prev,
      companySectors: prev.companySectors.filter((_, i) => i !== index),
    }));
  }

  function updateSector(index: number, value: string) {
    setForm((prev) => {
      const updated = [...prev.companySectors];
      updated[index] = { sectorId: value };
      return { ...prev, companySectors: updated };
    });
  }

  async function handleSubmit() {
    try {
      setLoading(true);
      setError(null);

      const payload = {
        cnpj: form.cnpj,
        taxRegime: form.taxRegime || undefined,
        accountant: form.accountant || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        companySectors: form.companySectors.filter(
          (s) => s.sectorId
        ),
      };

      const res = await fetch("/api/companies/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao criar empresa");
      }

      onCreated?.();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* BACKDROP */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* MODAL */}
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl">
        {/* HEADER */}
        <header className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Novo cliente</h2>
          <p className="text-sm text-muted-foreground">
            Cadastre um novo cliente manualmente
          </p>
        </header>

        {/* CONTENT */}
        <div className="p-6 space-y-5">
          {/* CNPJ */}
          <div>
            <label className="label">CNPJ</label>
            <input
              className="input w-full"
              placeholder="00.000.000/0000-00"
              value={form.cnpj}
              onChange={(e) => update("cnpj", e.target.value)}
            />
          </div>

          {/* Regime */}
          <div>
            <label className="label">Regime Tributário</label>
            <select
              className="input w-full"
              value={form.taxRegime}
              onChange={(e) => update("taxRegime", e.target.value)}
              disabled={loadingTaxRegimes}
            >
              <option value="">Selecione</option>

              {taxRegimes.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          {/* SETORES */}
          <div className="space-y-3">
            <label className="label">Setores da empresa</label>

            {form.companySectors.map((s, index) => (
              <div key={index} className="flex gap-2">
                <select
                  className="input flex-1"
                  value={s.sectorId}
                  onChange={(e) => updateSector(index, e.target.value)}
                >
                  <option value="">Selecione um setor</option>
                  {sectors.map((sector) => (
                    <option key={sector.id} value={sector.id}>
                      {sector.name}
                    </option>
                  ))}
                </select>

                {form.companySectors.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSector(index)}
                    className="text-sm text-red-500"
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addSector}
              className="text-sm text-muted-foreground"
            >
              + Adicionar setor
            </button>
          </div>

          {/* Contador */}
          <div>
            <label className="label">Contador</label>
            <input
              className="input w-full"
              placeholder="Ex: Augusta"
              value={form.accountant}
              onChange={(e) => update("accountant", e.target.value)}
            />
          </div>

          {/* Contato */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">E-mail</label>
              <input
                className="input w-full"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </div>

            <div>
              <label className="label">Telefone</label>
              <input
                className="input w-full"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        {/* FOOTER */}
        <footer className="flex justify-end gap-3 border-t px-6 py-4 bg-muted/30">
          <button
            onClick={onClose}
            className="text-sm text-muted-foreground"
          >
            Cancelar
          </button>

          <button
            onClick={handleSubmit}
            disabled={loading || loadingTaxRegimes}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Criando..." : "Criar cliente"}
          </button>
        </footer>
      </div>
    </div>
  );
}