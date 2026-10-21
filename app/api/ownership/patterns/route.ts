import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDistributionUser } from "@/lib/profit-distribution-auth";

export async function POST(request: Request) {
  const unauthorized = await requireDistributionUser();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const { patternType, documentType, description, exampleText } = body;
    if (!patternType || !documentType || !description) {
      return NextResponse.json({ error: "Campos obrigatórios: patternType, documentType, description." }, { status: 400 });
    }
    const pattern = await prisma.ownershipDocumentPattern.create({
      data: { patternType, documentType, description, exampleText: exampleText ?? null },
    });
    return NextResponse.json(pattern, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao registrar padrão." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const unauthorized = await requireDistributionUser();
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const documentType = searchParams.get("documentType");
    const patterns = await prisma.ownershipDocumentPattern.findMany({
      where: documentType ? { documentType } : undefined,
      orderBy: { successCount: "desc" },
      take: 50,
    });
    return NextResponse.json(patterns);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao listar padrões." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const unauthorized = await requireDistributionUser();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const { id, success } = body;
    if (!id) {
      return NextResponse.json({ error: "Campo obrigatório: id." }, { status: 400 });
    }
    const pattern = await prisma.ownershipDocumentPattern.update({
      where: { id },
      data: success ? { successCount: { increment: 1 } } : { failureCount: { increment: 1 } },
    });
    return NextResponse.json(pattern);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar padrão." }, { status: 500 });
  }
}