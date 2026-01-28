"use client";

import { useState } from "react";
import type { CompanyEditDTO } from "../dto/company-edit.dto";

type UIOwner = {
  id?: string;
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
  const [data, setData] = useState<CompanyEditDTO & {
    companySectors: UISector[];
  }>(() => ({
    ...initial,
    companySectors: withTempIds(initial.companySectors),
  }));

  const [loading, setLoading] = useState(false);

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
          : typeof data.taxRegime === "string"
          ? data.taxRegime
          : undefined,
    };

    const res = await fetch(`/api/company/${cnpj}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let errMsg = "Erro ao salvar empresa";

      try {
        const err = await res.json();
        errMsg = err.error ?? errMsg;
      } catch {}

      throw new Error(errMsg);
    }

    setLoading(false);
  }

  console.log("RESET COM", initial.companySectors);

  return {
    data,
    update,
    reset,
    save,
    loading,
  };
}
