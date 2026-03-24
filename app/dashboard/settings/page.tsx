// app/dashboard/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth"; // caminho conforme seu projeto
import prisma from "@/lib/prisma";
import { SettingsNav } from "@/components/settings/SettingsNav";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskEmail(value: string) {
  if (!EMAIL_REGEX.test(value)) {
    return value;
  }

  const [localPart, domain] = value.split("@");
  return `${"*".repeat(localPart.length)}@${domain}`;
}

async function updateDisplayName(formData: FormData) {
  "use server";

  const user = await getCurrentUser();
  if (!user) {
    return redirect("/");
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { name },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
}

async function updateEmail(formData: FormData) {
  "use server";

  const user = await getCurrentUser();
  if (!user) {
    return redirect("/");
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!EMAIL_REGEX.test(email)) {
    return;
  }

  const existingUser = await prisma.user.findFirst({
    where: {
      username: email,
      id: { not: user.id },
    },
    select: { id: true },
  });

  if (existingUser) {
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { username: email },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return redirect("/"); // login na "/"

  const displayName = user.name || user.username;
  const displayEmail = maskEmail(user.username);

  return (
    <main className="flex flex-1 min-h-0 gap-6">
      <SettingsNav activeItem="conta" isAdmin={user.role === "ADMIN"} />

      {/* CONTEUDO */}
      <section className="flex-1 bg-white rounded-lg shadow-2xl p-7 overflow-auto">
        <h1 className="text-2xl font-bold mb-6">
          Perfil do Usuario
        </h1>

        <div className="space-y-6">
          <div className="border-b pb-4">
            <input
              id="edit-display-name"
              type="checkbox"
              className="peer sr-only"
            />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Nome exibido
                </p>
                <p className="font-medium">
                  {displayName}
                </p>
              </div>
              <label
                htmlFor="edit-display-name"
                className="cursor-pointer px-4 py-1.5 text-sm rounded-md border hover:bg-muted"
              >
                Editar
              </label>
            </div>

            <form
              action={updateDisplayName}
              className="mt-4 hidden items-center gap-3 peer-checked:flex"
            >
              <input
                type="text"
                name="name"
                defaultValue={displayName}
                className="w-72 rounded-md border px-3 py-2 text-sm"
              />
              <button className="px-4 py-1.5 text-sm rounded-md border hover:bg-muted">
                Salvar
              </button>
            </form>
          </div>

          <div className="border-b pb-4">
            <input
              id="edit-email"
              type="checkbox"
              className="peer sr-only"
            />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Email
                </p>
                <p className="font-medium">
                  {displayEmail}
                </p>
              </div>
              <label
                htmlFor="edit-email"
                className="cursor-pointer px-4 py-1.5 text-sm rounded-md border hover:bg-muted"
              >
                Editar
              </label>
            </div>

            <form
              action={updateEmail}
              className="mt-4 hidden items-center gap-3 peer-checked:flex"
            >
              <input
                type="email"
                name="email"
                defaultValue={user.username}
                className="w-72 rounded-md border px-3 py-2 text-sm"
              />
              <button className="px-4 py-1.5 text-sm rounded-md border hover:bg-muted">
                Salvar
              </button>
            </form>
          </div>
          <div className="pb-1">
            <p className="text-sm text-muted-foreground">Permissao</p>
            <p className="mt-1 font-medium">{user.role}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
