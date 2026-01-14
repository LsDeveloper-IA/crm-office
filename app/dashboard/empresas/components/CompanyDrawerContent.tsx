"use client";

import { useMemo, useState } from "react";
import { GeneralTab } from "./tabs/GeneralTab";
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
  company,
  onClose,
}: Props) {
  const availableSectors = useSectors();
  const [activeTab, setActiveTab] = useState<Tab>("geral");
  const [isEditing, setIsEditing] = useState(false);

  const initialEditData = useMemo(
    () => ({
      name: company.name,
      taxRegime: company.taxRegime ? {
        key: company.taxRegime.key,
        name: company.taxRegime.name,
      } : undefined,
      
      accountant: company.accountant,

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

          <nav className="mt-4 flex gap-2">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-sm capitalize ${
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

          {activeTab === "QSA" && <QsaTab qsas={company.qsas} />}

          {activeTab === "atividades" && (
            <ActivitiesTab activities={company.activities} />
          )}
        </div>

        {/* FOOTER */}
        <footer className="border-t p-4 flex justify-between">
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)}>
              Editar
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setIsEditing(false);
                  edit.reset();
                }}
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
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