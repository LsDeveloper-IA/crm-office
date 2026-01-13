import { NextRequest, NextResponse } from "next/server";
import { normalizeCNPJ, isValidCNPJ } from "@/lib/cnpj";
import { getOrCreateCompanyByCnpj } from "@/lib/company/company.create";


export async function POST( req: NextRequest ) {
  try {
    const { cnpj } = await req.json();
    const normalized = normalizeCNPJ(cnpj);

    if (!isValidCNPJ(normalized)) {
      return NextResponse.json({ error: "CNPJ inválido." }, { status: 400 });
    }
    const company = await getOrCreateCompanyByCnpj(normalized);

    return NextResponse.json(company);
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Erro interno" },
      { status: 500 }
    );
  }
}