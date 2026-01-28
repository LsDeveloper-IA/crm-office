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
      .then((sectors: Array<{ id: string | number; name: string }>) =>
        setData(
          sectors.map((s) => ({
            id: String(s.id),
            name: s.name,
          }))
        )
      );
  }, []);

  return data;
}
