export const runtime = "nodejs";

import { Header } from "@/components/layout/header"
import { MenuBar } from "@/components/layout/menu-bar"
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function layoutDefault({ children, }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return redirect("/"); // login na "/"
  
  return (
    <main className="grid min-h-screen grid-cols-[80px_1fr]">
      <aside className="border-r">
        <MenuBar />
      </aside>

      <section className="flex flex-col">
        <Header />
        <div className="p-6">
          {children}
        </div>
      </section>
    </main>
  )
}
