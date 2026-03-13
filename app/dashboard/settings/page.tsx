// app/dashboard/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth"; // caminho conforme seu projeto

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return redirect("/"); // login na "/"

  return (
    <main className="flex flex-1 min-h-0 gap-6">
      {/* SIDEBAR */}
      <aside className="w-64 bg-white rounded-lg shadow-2xl p-5">
        <h2 className="text-lg font-semibold mb-4">Configurações</h2>

        <nav className="flex flex-col gap-2">
          <button className="text-left px-3 py-2 rounded-md bg-muted">
            Minha conta
          </button>

          <button className="text-left px-3 py-2 rounded-md hover:bg-muted">
            Segurança
          </button>

          <button className="text-left px-3 py-2 rounded-md hover:bg-muted">
            Notificações
          </button>

          <button className="text-left px-3 py-2 rounded-md hover:bg-muted">
            Dispositivos
          </button>
        </nav>
      </aside>

      {/* CONTEÚDO */}
      <section className="flex-1 bg-white rounded-lg shadow-2xl p-7 overflow-auto">
        <h1 className="text-2xl font-bold mb-6">
          Perfil do Usuário
        </h1>

        <div className="space-y-6">
          <div className="flex justify-between items-center border-b pb-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Nome exibido
              </p>
              <p className="font-medium">
                Lucas Serafim
              </p>
            </div>

            <button className="px-4 py-1.5 text-sm rounded-md border hover:bg-muted">
              Editar
            </button>
          </div>

          <div className="flex justify-between items-center border-b pb-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Email
              </p>
              <p className="font-medium">
                ********@gmail.com
              </p>
            </div>

            <button className="px-4 py-1.5 text-sm rounded-md border hover:bg-muted">
              Editar
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}