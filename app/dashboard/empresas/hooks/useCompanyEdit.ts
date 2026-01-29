"use client";

import { useState } from "react";
import type { CompanyEditDTO } from "../dto/company-edit.dto";

type UIOwner = {
  id?: number;
  name: string;
  tempId: string;
};

type UISector = CompanyEditDTO["companySectors"][number] & {
  tempId: string;
  owners: UIOwner[];
};

function withTempIds(
  sectors: CompanyEditDTO["companySectors"]
): UISector[] {
  return sectors.map((s) => ({
    ...s,
    tempId: crypto.randomUUID(),
    owners: (s.owners ?? []).map((o) => ({
      ...o,
      tempId: crypto.randomUUID(),
    })),
  }));
}

export function useCompanyEdit(
  cnpj: string,
  initial: CompanyEditDTO
) {
  const [data, setData] = useState<
    Omit<CompanyEditDTO, "companySectors"> & {
      companySectors: UISector[];
    }
  >(() => ({
    ...initial,
    companySectors: withTempIds(initial.companySectors),
  }));

  const [loading, setLoading] = useState(false);

  // 🔧 update tipado corretamente
  function update<K extends keyof CompanyEditDTO>(
    key: K,
    value: K extends "companySectors"
      ? UISector[]
      : CompanyEditDTO[K]
  ) {
    setData((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function reset() {
    setData({
      ...initial,
      companySectors: withTempIds(initial.companySectors),
    });
  }

  async function save() {
    setLoading(true);

    const payload = {
      ...data,
      taxRegime:
        data.taxRegime && typeof data.taxRegime === "object"
          ? data.taxRegime.key
          : undefined,
    };

    const res = await fetch(`/api/company/${cnpj}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let msg = "Erro ao salvar empresa";
      try {
        const err = await res.json();
        msg = err.error ?? msg;
      } catch {}
      setLoading(false);
      throw new Error(msg);
    }

    setLoading(false);
  }

  return { data, update, reset, save, loading };
}