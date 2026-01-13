"use client";

import type { CompanyEditDTO } from "../../dto/company-edit.dto";
import { useTaxRegimes } from "../../hooks/useTaxRegimes";

type AccountantOption = {
  id: string;
  name: string;
};

type Props = {
  company: CompanyEditDTO;
  isEditing: boolean;
  onChange: <K extends keyof CompanyEditDTO>(
    key: K,
    value: CompanyEditDTO[K]
  ) => void;
  accountants: AccountantOption[];
};

export function GeneralTab({
  company,
  onChange,
  isEditing,
  accountants,
}: Props) {
  const { taxRegimes, loading } = useTaxRegimes();

  return (
    <div className="space-y-5">
      {/* 📍 ENDEREÇO — SOMENTE LEITURA */}
      <div>
        <label className="text-sm font-medium">Endereço</label>
        <p className="mt-1 text-sm text-muted-foreground">
          {company.publicSpace ?? "-"}, {company.number ?? "-"}
        </p>
        <p className="text-sm text-muted-foreground">
          {company.district ?? "-"} — {company.city ?? "-"}/{company.state ?? "-"}
        </p>
      </div>

      {/* 🧾 REGIME TRIBUTÁRIO */}
      <div>
        <label className="text-sm font-medium">Regime Tributário</label>

        {isEditing ? (
          <select
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={company.taxRegime?.key ?? ""}
            disabled={loading}
            onChange={(e) => {
              const selected = taxRegimes.find(
                (r) => r.key === e.target.value
              );

              onChange(
                "taxRegime",
                selected
                  ? { key: selected.key, name: selected.name }
                  : undefined
              );
            }}
          >
            <option value="">Selecione um regime</option>

            {taxRegimes.map((regime) => (
              <option key={regime.key} value={regime.key}>
                {regime.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            {company.taxRegime?.name ?? "-"}
          </p>
        )}
      </div>

      {/* 👤 CONTADOR */}
      <div>
        <label className="text-sm font-medium">Contador</label>

        {isEditing ? (
          <select
            className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            value={company.accountant ?? ""}
            onChange={(e) =>
              onChange("accountant", e.target.value)
            }
          >
            <option value="">Selecione um contador</option>
            {accountants.map((acc) => (
              <option key={acc.id} value={acc.name}>
                {acc.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            {company.accountant ?? "-"}
          </p>
        )}
      </div>
    </div>
  );
}