import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDistributionUser } from "@/lib/profit-distribution-auth";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireDistributionUser();
  if (denied) return denied;

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Registro QSA inv\u00e1lido." }, { status: 400 });
  }

  const result = await prisma.companyQsa.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Registro QSA n\u00e3o encontrado." }, { status: 404 });
  }

  revalidatePath("/dashboard/distribuicao-lucros");
  return NextResponse.json({ removed: true, id });
}
