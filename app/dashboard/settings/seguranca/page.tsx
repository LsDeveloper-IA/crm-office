export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SettingsNav } from "@/components/settings/SettingsNav";
import prisma from "@/lib/prisma";

type SecurityPageProps = {
  searchParams?: Promise<{
    error?: string;
    success?: string;
  }>;
};

async function updatePassword(formData: FormData) {
  "use server";

  const user = await getCurrentUser();
  if (!user) {
    return redirect("/");
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return redirect("/dashboard/settings/seguranca?error=missing_fields");
  }

  if (newPassword.length < 6) {
    return redirect("/dashboard/settings/seguranca?error=short_password");
  }

  if (newPassword !== confirmPassword) {
    return redirect("/dashboard/settings/seguranca?error=password_mismatch");
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, password: true },
  });

  if (!currentUser) {
    return redirect("/");
  }

  const passwordMatches = await bcrypt.compare(
    currentPassword,
    currentUser.password
  );

  if (!passwordMatches) {
    return redirect("/dashboard/settings/seguranca?error=invalid_current_password");
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  revalidatePath("/dashboard/settings/seguranca");

  return redirect("/dashboard/settings/seguranca?success=password_updated");
}

function getMessage(error?: string, success?: string) {
  if (success === "password_updated") {
    return {
      text: "Senha alterada com sucesso.",
      className: "border-green-200 bg-green-50 text-green-700",
    };
  }

  switch (error) {
    case "missing_fields":
      return {
        text: "Preencha todos os campos da senha.",
        className: "border-red-200 bg-red-50 text-red-700",
      };
    case "short_password":
      return {
        text: "A nova senha precisa ter pelo menos 6 caracteres.",
        className: "border-red-200 bg-red-50 text-red-700",
      };
    case "password_mismatch":
      return {
        text: "A confirmacao da senha nao confere.",
        className: "border-red-200 bg-red-50 text-red-700",
      };
    case "invalid_current_password":
      return {
        text: "A senha atual esta incorreta.",
        className: "border-red-200 bg-red-50 text-red-700",
      };
    default:
      return null;
  }
}

export default async function SecurityPage({
  searchParams,
}: SecurityPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    return redirect("/");
  }

  const params = (await searchParams) ?? {};
  const message = getMessage(params.error, params.success);

  return (
    <main className="flex flex-1 min-h-0 gap-6">
      <SettingsNav activeItem="seguranca" isAdmin={user.role === "ADMIN"} />

      <section className="flex-1 overflow-auto rounded-lg bg-white p-7 shadow-2xl">
        <h1 className="text-2xl font-bold mb-6">Seguranca</h1>

        {message ? (
          <div className={`mb-6 rounded-md border px-4 py-3 text-sm ${message.className}`}>
            {message.text}
          </div>
        ) : null}

        <form action={updatePassword} className="space-y-6">
          <div className="border-b pb-4">
            <p className="text-sm text-muted-foreground">Conta autenticada</p>
            <p className="font-medium">{user.name || user.username}</p>
            <p className="text-sm text-muted-foreground">{user.username}</p>
          </div>

          <div className="border-b pb-4">
            <p className="text-sm text-muted-foreground mb-2">Senha atual</p>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              className="w-full max-w-md rounded-md border px-3 py-2 text-sm"
              required
            />
          </div>

          <div className="border-b pb-4">
            <p className="text-sm text-muted-foreground mb-2">Nova senha</p>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              className="w-full max-w-md rounded-md border px-3 py-2 text-sm"
              minLength={6}
              required
            />
          </div>

          <div className="border-b pb-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground mb-2">
                  Confirmar nova senha
                </p>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  className="w-full max-w-md rounded-md border px-3 py-2 text-sm"
                  minLength={6}
                  required
                />
              </div>

              <button className="self-end rounded-md border px-4 py-2 text-sm hover:bg-muted">
                Salvar
              </button>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
