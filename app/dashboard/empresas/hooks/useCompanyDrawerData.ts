"use client";

import { useEffect, useState } from "react";
import type { CompanyDrawerDTO } from "../dto/company-drawer.dto";

export function useCompanyDrawerData(cnpj: string | null) {
  const [data, setData] = useState<CompanyDrawerDTO | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const start = async () => {
      await Promise.resolve();
      if (!active) return;

      if (!cnpj) {
        setData(null);
        setLoading(false);
        return;
      }

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
          setData(company);
        })
        .catch(() => {
          if (!active) return;
          setData(null);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    };

    start();

    return () => {
      active = false;
    };
  }, [cnpj]);

  return { data, loading };
}