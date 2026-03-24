export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

const roleLabelMap = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  USER: "Usuario",
} as const;

function formatRole(role: keyof typeof roleLabelMap) {
  return roleLabelMap[role] ?? role;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export default async function UsersSettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return redirect("/");
  }

  if (user.role !== "ADMIN") {
    return redirect("/dashboard/settings");
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      active: true,
      createdAt: true,
    },
    orderBy: [
      { role: "asc" },
      { name: "asc" },
      { username: "asc" },
    ],
  });

  return (
    <main className="flex flex-1 min-h-0 gap-6">
      <SettingsNav activeItem="usuarios" isAdmin />

      <section className="flex-1 overflow-auto rounded-lg bg-white p-7 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Usuarios</h1>
            <p className="text-sm text-muted-foreground">
              Lista de usuarios cadastrados no sistema.
            </p>
          </div>

          <Badge variant="secondary" size="lg">
            {users.length} usuarios
          </Badge>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Permissao</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {users.map((listedUser) => (
              <TableRow key={listedUser.id}>
                <TableCell className="font-medium">
                  {listedUser.name || "-"}
                </TableCell>
                <TableCell>{listedUser.username}</TableCell>
                <TableCell>
                  <Badge
                    variant={listedUser.role === "ADMIN" ? "default" : "outline"}
                  >
                    {formatRole(listedUser.role)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={listedUser.active ? "success" : "error"}>
                    {listedUser.active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(listedUser.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </main>
  );
}
