"use client";

import type { CompanyEditDTO } from "../../dto/company-edit.dto";
import { useTaxRegimes } from "../../hooks/useTaxRegimes";
import { CompanyDrawerDTO } from "../../dto/company-drawer.dto";

const GROUPS_OPTIONS = [
  { value: "andrade", label: "Andrade" },
  { value: "anmap", label: "Anmap" },
  { value: "danielborges", label: "Daniel Borges" },
  { value: "empório", label: "Empório" },
  { value: "fialho", label: "Fialho" },
  { value: "helmut", label: "Helmut" },
  { value: "lincoln", label: "Lincoln" },
  { value: "marcosleal", label: "Marcos Leal" },
  { value: "prime", label: "Prime" },
  { value: "primefactoring", label: "Prime Factoring" },
  { value: "raquelgrangeiro", label: "Raquel Grangeiro" },
  { value: "rubens", label: "Rubens" },
  { value: "tdois", label: "Tdois" },
  { value: "thiagoautoexpress", label: "Thiago Auto Express" },
  { value: "ximenes", label: "Ximenes" },
  { value: "viper", label: "Viper" },
  { value: "torquato", label: "Torquato" },
  { value: "mr2", label: "MR2" },
];

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
  errors?: {
    systemName?: string;
    systemValue?: string;
  };
};

type SystemErrors = {
  systemName?: string;
  systemValue?: string;
};

export function validateForm(company: CompanyDrawerDTO): SystemErrors {
  const errors: SystemErrors = {};

  if (company.paysSystem) {
    if (!company.systemName || company.systemName.trim() === "") {
      errors.systemName = "Informe o nome do sistema";
    }

    if (
      company.systemValue === undefined ||
      isNaN(company.systemValue) ||
      company.systemValue < 0
    ) {
      errors.systemValue = "Informe um valor válido";
    }
  }

  return errors;
}

export function GeneralTab({
  company,
  onChange,
  isEditing,
  accountants,
  errors,
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
      
      {/* 💰 HONORÁRIOS */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Honorários</label>

        {isEditing ? (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={company.paysFees ?? false}
                onChange={(e) =>
                  onChange("paysFees", e.target.checked)
                }
              />
              Paga honorários
            </label>

            {company.paysFees && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <select
                  className="rounded-md border px-3 py-2 text-sm"
                  value={company.feesType ?? ""}
                  onChange={(e) =>
                    onChange("feesType", e.target.value)
                  }
                >
                  <option value="">Tipo</option>
                  <option value="FIXO">Fixo</option>
                  <option value="PERCENTUAL">Percentual</option>
                  <option value="PACOTE">Pacote</option>
                </select>

                <input
                  type="number"
                  className="rounded-md border px-3 py-2 text-sm"
                  placeholder="Valor"
                  value={company.feesValue ?? ""}
                  onChange={(e) =>
                    onChange("feesValue", Number(e.target.value))
                  }
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {company.paysFees
              ? `Sim (${company.feesType ?? "-"})`
              : "Não paga honorários"}
          </p>
        )}
      </div>

      {/* 🖥️ SISTEMA */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Sistema</label>

        {isEditing ? (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={company.paysSystem ?? false}
                onChange={(e) =>
                  onChange("paysSystem", e.target.checked)
                }
              />
              Paga sistema
            </label>

            {company.paysSystem && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <input
                    className="rounded-md border px-3 py-2 text-sm"
                    placeholder="Nome do sistema"
                    value={company.systemName ?? ""}
                    onChange={(e) =>
                      onChange("systemName", e.target.value)
                    }
                  />
                  {errors?.systemName && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.systemName}
                    </p>
                  )}
                </div>

                <div>
                  <input
                    type="number"
                    className="rounded-md border px-3 py-2 text-sm"
                    placeholder="Valor"
                    value={company.systemValue ?? ""}
                    onChange={(e) =>
                      onChange("systemValue", Number(e.target.value))
                    }
                  />
                  {errors?.systemValue && (
                    <p className="mt-1 text-xs text-red-500">
                      {errors.systemValue}
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {company.paysSystem ? 
            `${company.systemName ?? "Sistema"}` 
            : "Não paga sistema"}
          </p>
        )}
      </div>

      {/* GRUPO */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Grupo</label>

        {isEditing ? (
          <select
            className="ml-2 rounded-md border px-3 py-2 text-sm"
            value={company.group ?? ""}
            onChange={(e) => onChange("group", e.target.value)}
          >
            <option value="" disabled>
              Selecione um grupo
            </option>

            {GROUPS_OPTIONS.map((group) => (
              <option key={group.value} value={group.value}>
                {group.label}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-muted-foreground">
            {GROUPS_OPTIONS.find(
              (group) => group.value === company.group
            )?.label ?? "Sem grupo definido"}
          </p>
        )}
      </div>

      {/* DECIMO TERCEIRO */}
      <div className="space-y-2">
        <label className="text-sm font-medium">13°</label>

        {isEditing ? (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={company.thirteenth ?? false}
                onChange={(e) =>
                  onChange("thirteenth", e.target.checked)
                }
              />
              Cobra 13°
            </label>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {company.thirteenth
              ? `Cobra 13°`
              : "Não cobra 13°"}
          </p>
        )}
      </div>
    </div>
  );
}