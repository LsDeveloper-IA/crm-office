"use client";

import { useMemo, useRef, useState } from "react";
import { GeneralTab, validateForm } from "./tabs/GeneralTab";
import { SectorsTab } from "./tabs/SectorsTab";
import { QsaTab } from "./tabs/QsaTab";
import { ActivitiesTab } from "./tabs/ActivitiesTab";
import { useCompanyEdit } from "../hooks/useCompanyEdit";
import type { CompanyDrawerDTO } from "../dto/company-drawer.dto";
import { useSectors } from "../hooks/useSectors";

const tabs = ["geral", "setores", "QSA", "atividades"] as const;
type Tab = typeof tabs[number];


type Props = {
  company: CompanyDrawerDTO;
  onClose: () => void;
};

export function CompanyDrawerContent({
  company: initialCompany,
  onClose,
}: Props) {
  const [company, setCompany] = useState(initialCompany);
  const [refreshing, setRefreshing] = useState(false);
  const refreshLock = useRef(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const availableSectors = useSectors();
  const [activeTab, setActiveTab] = useState<Tab>("geral");
  const [isEditing, setIsEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const initialEditData = useMemo(
    () => ({
      name: company.name,
      taxRegime: company.taxRegime ? {
        key: company.taxRegime.key,
        name: company.taxRegime.name,
      } : undefined,
      
      accountant: company.accountant,
      paysFees: company.paysFees ?? false,
      group: company.group ?? undefined,
      thirteenth: company.thirteenth ?? false,
      paysSystem: company.paysSystem ?? false,

      publicSpace: company.address?.publicSpace ?? "",
      number: company.address?.number ?? "",
      district: company.address?.district ?? "",
      city: company.address?.city ?? "",
      state: company.address?.state ?? "",

      companySectors: company.companySectors ?? [],
    }),
    [company]
  );

  const edit = useCompanyEdit(company.cnpj, initialEditData);

  async function refreshReceita() {
    if (refreshLock.current || isEditing) return;
    refreshLock.current = true;
    setRefreshing(true);
    setRefreshMessage("");
    try {
      const url = `/api/company/${encodeURIComponent(company.cnpj)}`;
      const response = await fetch(`${url}/receita`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Erro ao atualizar dados.");
      }
      const details = await fetch(url, { cache: "no-store" });
      if (!details.ok) throw new Error("Dados salvos. Reabra a empresa para visualizar a atualização.");
      const updated: CompanyDrawerDTO = await details.json();
      setCompany(updated);
      edit.update("name", updated.name);
      for (const field of ["publicSpace", "number", "district", "city", "state"] as const) {
        edit.update(field, updated.address?.[field] ?? "");
      }
      setRefreshMessage("Dados atualizados com sucesso.");
    } catch (error) {
      setRefreshMessage(error instanceof Error ? error.message : "Erro ao atualizar dados.");
    } finally {
      refreshLock.current = false;
      setRefreshing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="w-[480px] bg-white flex flex-col">
        {/* HEADER */}
        <header className="border-b px-6 py-4">
          <h2 className="text-lg font-bold">{company.name}</h2>
          <p className="text-sm text-muted-foreground">
            CNPJ: {company.cnpj}
          </p>

          <button
            type="button"
            onClick={refreshReceita}
            disabled={refreshing || isEditing}
            className="mt-3 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {refreshing ? "Atualizando..." : "Atualizar Dados (Receita)"}
          </button>
          <p role="status" aria-live="polite" className="mt-2 text-sm">{refreshMessage}</p>

          <nav className="mt-4 flex gap-2">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-sm capitalize cursor-pointer ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </header>

        {/* CONTENT */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === "geral" && (
            <GeneralTab
              company={edit.data}
              onChange={edit.update}
              isEditing={isEditing}
              accountants={[
                { id: "1", name: "Orlando" },
                { id: "2", name: "Augusta" },
              ]}
              errors={errors}
            />
          )}

          {activeTab === "setores" && (
            <SectorsTab
              sectors={edit.data.companySectors}
              availableSectors={availableSectors}
              isEditing={isEditing}
              onChange={(v) =>
                edit.update("companySectors", v)
              }
            />
          )}

          {activeTab === "QSA" && <QsaTab qsas={company.qsas} partners={company.partners ?? []} />}

          {activeTab === "atividades" && (
            <ActivitiesTab activities={company.activities} />
          )}
        </div>

        {/* FOOTER */}
        <footer className="border-t p-4 flex justify-between">
          {!isEditing ? (
            <button disabled={refreshing} className="cursor-pointer disabled:opacity-50" onClick={() => setIsEditing(true)}>
              Editar
            </button>
          ) : (
            <>
              <button className="cursor-pointer" 
                onClick={() => {
                  setIsEditing(false);
                  edit.reset();
                }}
              >
                Cancelar
              </button>
              <button className="cursor-pointer" 
                onClick={async () => {
                  const validationErrors = validateForm({
                    ...company,
                    ...edit.data,
                  });

                  if (Object.keys(validationErrors).length > 0) {
                    setErrors(validationErrors);
                    return;
                  }

                  setErrors({});
                  await edit.save();
                  setIsEditing(false);
                }}
                disabled={edit.loading}
              >
                Salvar
              </button>
            </>
          )}
        </footer>
      </aside>
    </div>
  );
}
