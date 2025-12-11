"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardClientGuard() {
  const router = useRouter();

  useEffect(() => {
    let mounted = true;
    async function check() {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (!mounted) return;
      if (!res.ok) {
        router.replace("/login");
      }
    }
    check();
    return () => {
      mounted = false;
    };
  }, [router]);

  return null;
}