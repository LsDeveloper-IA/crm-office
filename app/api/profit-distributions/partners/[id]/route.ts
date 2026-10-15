import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDistributionUser } from "@/lib/profit-distribution-auth";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireDistributionUser();
  if (denied) return denied;

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "S\u00f3cio inv\u00e1lido." }, { status: 400 });
  }

  try {
    const partner = await prisma.profitPartner.findUnique({ where: { id }, select: { id: true } });
    if (!partner) return NextResponse.json({ error: "S\u00f3cio n\u00e3o encontrado." }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.profitDistribution.deleteMany({ where: { partnerId: id } });
      await tx.profitPartner.delete({ where: { id } });
    });

    revalidatePath("/dashboard/distribuicao-lucros");
    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error("Erro ao excluir s\u00f3cio", error);
    return NextResponse.json({ error: "N\u00e3o foi poss\u00edvel excluir o s\u00f3cio." }, { status: 500 });
  }
}
