import { cookies, headers } from "next/headers";
import jwt from "jsonwebtoken";
import prisma from "./prisma"; // ajuste o caminho se o seu arquivo prisma estiver em outro lugar

export type CurrentUser = { id: number; username: string; role: string } | null;

/**
 * Tenta obter o token do cookie (ou do header como fallback),
 * verifica o JWT e retorna o usuário do banco ou null.
 *
 * Uso: const user = await getCurrentUser();
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  try {
    // cookies() e headers() são APIs dinâmicas — await necessário
    const cookieStore = await cookies();
    const token = cookieStore.get?.("token")?.value;

    // fallback para header caso cookies não estejam acessíveis
    let finalToken = token;
    if (!finalToken) {
      const hdrs = await headers();
      const cookieHeader = typeof hdrs.get === "function" ? hdrs.get("cookie") : null;
      if (typeof cookieHeader === "string") {
        const match = cookieHeader.split(";").map(s => s.trim()).find(p => p.startsWith("token="));
        if (match) finalToken = match.split("=")[1];
      }
    }

    if (!finalToken) return null;

    // verificar token
    let payload: any;
    try {
      payload = jwt.verify(finalToken, process.env.JWT_SECRET!);
    } catch {
      return null;
    }

    const userId = Number(payload?.sub);
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, name: true },
    });

    if (!user) return null;
    return { id: user.id, username: user.username!, role: user.role!, name: user.name! };
  } catch (err) {
    console.error("getCurrentUser error:", err);
    return null;
  }
}