"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useOwnershipUpdates() {
  const router = useRouter();
  useEffect(() => {
    const source = new EventSource("/api/ownership/events");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    };
    source.addEventListener("ready", refresh);
    source.addEventListener("ownership-updated", refresh);
    // Browser reconnects automatically. Focus also recovers when a proxy blocks SSE.
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      source.close();
      window.removeEventListener("focus", refresh);
    };
  }, [router]);
}
