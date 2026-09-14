import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

/** Authorize before reading private data or performing any side effects. */
export async function requireDistributionUser() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { active: true } });
  if (!account?.active) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }
  return null;
}
