"use client";

import { useEffect, useRef, useState } from "react";
import type { CompanyEditDTO } from "../dto/company-edit.dto";

export function useCompanyEdit(cnpj: string, initial: CompanyEditDTO) {
  const [data, setData] = useState<CompanyEditDTO>(initial);
  const [loading, setLoading] = useState(false);

  // 🔐 Guarda o último CNPJ sincronizado
  const lastCnpjRef = useRef<string | null>(null);

  useEffect(() => {
    if (!cnpj) return;

    // 🔥 só reseta se mudou de empresa
    if (lastCnpjRef.current !== cnpj) {
      setData(initial);
      lastCnpjRef.current = cnpj;
    }
  }, [cnpj, initial]);

  function update<K extends keyof CompanyEditDTO>(
    key: K,
    value: CompanyEditDTO[K]
  ) {
    setData((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function reset() {
    setData(initial);
  }

  async function save() {
    setLoading(true);

    const { taxRegime, accountant, companySectors } = data;

    await fetch(`/api/company/${cnpj}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    setLoading(false);
  }

  return {
    data,
    update,
    reset,
    save,
    loading,
  };
}