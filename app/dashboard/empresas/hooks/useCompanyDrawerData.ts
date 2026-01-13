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
      .then((company: CompanyDrawerDTO) => {
        if (!active) return;
        setData(company); // 🔥 SEM MAPEAR
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