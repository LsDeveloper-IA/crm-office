import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDistributionUser } from "@/lib/profit-distribution-auth";

export async function POST(request: Request) {
  const unauthorized = await requireDistributionUser();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const { companyCnpj, partnerName, field, oldValue, newValue, sourceFileId } = body;
    if (!companyCnpj || !partnerName || !field || !newValue) {
      return NextResponse.json({ error: "Campos obrigatórios: companyCnpj, partnerName, field, newValue." }, { status: 400 });
    }
    const correction = await prisma.ownershipCorrection.create({
      data: { companyCnpj, partnerName, field, oldValue: oldValue ?? null, newValue, sourceFileId: sourceFileId ?? null },
    });
    return NextResponse.json(correction, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao registrar correção." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const unauthorized = await requireDistributionUser();
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const companyCnpj = searchParams.get("companyCnpj");
    const corrections = await prisma.ownershipCorrection.findMany({
      where: companyCnpj ? { companyCnpj } : undefined,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json(corrections);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao listar correções." }, { status: 500 });
  }
}