// hooks/useSectors.ts
"use client";

import { useEffect, useState } from "react";

export function useSectors() {
  const [data, setData] = useState<
    { id: string; name: string }[]
  >([]);

  useEffect(() => {
    fetch("/api/sectors")
      .then((res) => res.json())
      .then((sectors) =>
        setData(
          sectors.map((s: any) => ({
            id: String(s.id), // 🔥 AQUI
            name: s.name,
          }))
        )
      );
  }, []);

  return data;
}