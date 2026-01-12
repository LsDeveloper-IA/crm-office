// app/dashboard/layout.tsx
export const runtime = "nodejs";

import DashboardShell from "@/components/layout/dashboard-shell";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";


export default async function DashboardLayout({ children }: React.PropsWithChildren) {
  const user = await getCurrentUser();
  if (!user) return redirect("/");

  return (
    <DashboardShell userName={user.name}>
      {children}
    </DashboardShell>
  );
}