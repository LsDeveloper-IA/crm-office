"use client";

import { useEffect, useState } from "react";
import type { CompanyDetailsDTO } from "../dto/company-details.dto";

type Props = {
  cnpj: string | null;
  onClose: () => void;
};

export function CompanyDrawer({ cnpj, onClose }: Props) {
  const [company, setCompany] = useState<CompanyDetailsDTO | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cnpj) return;

    setLoading(true);
    setCompany(null);

    fetch(`/api/company/${cnpj}`)
      .then((res) => res.json())
      .then((data) => setCompany(data))
      .finally(() => setLoading(false));
  }, [cnpj]);

  if (!cnpj) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* overlay */}
      <div
        className="flex-1 bg-black/40"
        onClick={onClose}
      />

      {/* drawer */}
      <aside className="w-[420px] bg-white p-6 overflow-auto">
        {loading && (
          <p className="text-sm text-muted-foreground">
            Carregando dados da empresa...
          </p>
        )}

        {!loading && company && (
          <>
            <header className="flex justify-between items-start mb-6">
              <h2 className="text-xl font-bold">{company.name}</h2>
              <button onClick={onClose} className="text-sm text-muted-foreground">
                Fechar
              </button>
            </header>

            {/* Dados gerais */}
            <section className="mb-6 space-y-1">
              <p><strong>CNPJ:</strong> {company.cnpj}</p>
              <p><strong>Regime:</strong> {company.profile?.taxRegime ?? "-"}</p>
              <p><strong>Contador:</strong> {company.profile?.accountant ?? "-"}</p>
              <p>
                <strong>Endereço:</strong>{" "}
                {company.publicSpace}, {company.number} -{" "}
                {company.district} / {company.city}-{company.state}
              </p>
            </section>

            {/* Setores */}
            <section>
              <h3 className="font-semibold mb-2">Setores</h3>

              <div className="space-y-3">
                {company.companySectors.map((cs) => (
                  <div
                    key={cs.sector.name}
                    className="flex justify-between items-center border rounded-lg px-3 py-2"
                  >
                    <span>{cs.sector.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {cs.owner?.username ?? "Sem responsável"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}