import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ReceitaUpdateError, updateCompanyFromReceita } from "@/lib/receita/update-company";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ cnpj: string }> }) {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
  }
  const { cnpj } = await params;
  if (!/^\d{14}$/.test(cnpj)) {
    return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
  }
  try {
    return NextResponse.json(await updateCompanyFromReceita(cnpj));
  } catch (error) {
    if (error instanceof ReceitaUpdateError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Erro ao atualizar empresa pela Receita", error);
    return NextResponse.json({ error: "Não foi possível salvar a atualização." }, { status: 500 });
  }
}
