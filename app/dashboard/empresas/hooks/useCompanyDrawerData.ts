"use client";

import { useEffect, useState } from "react";
import type { CompanyDrawerDTO } from "../dto/company-drawer.dto";

export function useCompanyDrawerData(cnpj: string | null) {
  const [data, setData] = useState<CompanyDrawerDTO | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cnpj) return;

    let active = true;

    setLoading(true);

    fetch(`/api/company/${cnpj}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Erro ao buscar empresa");
        }
        return res.json();
      })
      .then((company) => {
        if (!active) return;

        const mapped: CompanyDrawerDTO = {
          cnpj: company.cnpj,
          name: company.name,

          taxRegime: company.profile?.taxRegime,
          accountant: company.profile?.accountant,

          address: {
            publicSpace: company.publicSpace,
            number: company.number,
            district: company.district,
            city: company.city,
            state: company.state,
          },

          companySectors: company.companySectors.map(
            (cs: any) => ({
              sectorName: cs.sector.name,
              owner: cs.owner?.username,
            })
          ),

          qsas: company.qsas ?? [],

          activities: company.activities ?? [],
        };

        setData(mapped);
      })
      .catch(() => {
        setData(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [cnpj]);

  return { data, loading };
}