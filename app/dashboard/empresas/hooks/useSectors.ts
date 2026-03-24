// hooks/useSectors.ts
"use client";

import { useEffect, useState } from "react";

export function useSectors(enabled = true) {
  const [data, setData] = useState<
    { id: string; name: string }[]
  >([]);

  useEffect(() => {
    if (!enabled) return;

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
  }, [enabled]);

  return enabled ? data : [];
}
