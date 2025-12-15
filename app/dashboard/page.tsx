export const runtime = "nodejs";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth"; // caminho conforme seu projeto

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return redirect("/"); // login na "/"

  return (
    <main>
      <h1>Welcome to the Dashboard!</h1>
    </main>
  );
}