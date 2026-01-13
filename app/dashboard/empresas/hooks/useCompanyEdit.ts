"use client";

import { useEffect, useRef, useState } from "react";
import type { CompanyEditDTO } from "../dto/company-edit.dto";

export function useCompanyEdit(
  cnpj: string,
  initial: CompanyEditDTO
) {
  const [data, setData] = useState<CompanyEditDTO>(() => ({
    ...initial,
    companySectors: (initial.companySectors ?? []).map((s) => ({
      ...s,
      tempId: crypto.randomUUID(),
    })),
  }));

  const [loading, setLoading] = useState(false);
  const lastCnpjRef = useRef<string | null>(null);

  useEffect(() => {
    if (!cnpj) return;

    if (lastCnpjRef.current !== cnpj) {
      setData({
        ...initial,
        companySectors: (initial.companySectors ?? []).map((s) => ({
          ...s,
          tempId: crypto.randomUUID(),
        })),
      });
      lastCnpjRef.current = cnpj;
    }
  }, [cnpj]); // 🚫 NÃO dependa de initial

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
    setData((prev) => ({
      ...initial,
      companySectors: prev.companySectors, // mantém identidade
    }));
  }

  async function save() {
    setLoading(true);

    await fetch(`/api/company/${cnpj}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    setLoading(false);
  }

  return { data, update, reset, save, loading };
}