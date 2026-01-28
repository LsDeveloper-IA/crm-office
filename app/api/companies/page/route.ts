import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const PAGE_SIZE = 13; 

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cnpj = (searchParams.get("cnpj") ?? "").trim();

    if (!cnpj) {
      return NextResponse.json({ error: "cnpj é obrigatório" }, { status: 400 });
    }

    const company = await prisma.company.findUnique({
      where: { cnpj },
      select: { cnpj: true, name: true },
    });

    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }

    let countBefore = 0;

    if (company.name) {
      countBefore = await prisma.company.count({
        where: {
          OR: [
            { name: { lt: company.name } },
            { AND: [{ name: company.name }, { cnpj: { lt: company.cnpj } }] },
          ],
        },
      });
    } else {
      const nonNull = await prisma.company.count({
        where: { name: { not: null } },
      });

      const nullBefore = await prisma.company.count({
        where: { name: null, cnpj: { lt: company.cnpj } },
      });

      countBefore = nonNull + nullBefore;
    }

    const position = countBefore + 1; // rank 1-based
    const page = Math.floor((position - 1) / PAGE_SIZE) + 1;

    return NextResponse.json({ page, position, pageSize: PAGE_SIZE });
  } catch (err: unknown) {
    console.error("GET /api/companies/page ERROR:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
