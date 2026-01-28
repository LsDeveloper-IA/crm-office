"use client";

import { useEffect, useState } from "react";

export type TaxRegime = {
  key: string;
  name: string;
};

export function useTaxRegimes() {
  const [data, setData] = useState<TaxRegime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/tax-regimes");

        if (!res.ok) {
          throw new Error("Erro ao carregar regimes");
        }

        const json = await res.json();
        if (active) setData(json);
      } catch (err: unknown) {
        if (!active) return;
        const message =
          err instanceof Error ? err.message : "Erro ao carregar regimes";
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  return {
    taxRegimes: data,
    loading,
    error,
  };
}
