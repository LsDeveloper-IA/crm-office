import prisma from "@/lib/prisma";
import { error } from "console";
import { NextRequest, NextResponse } from "next/server";

type Filters = {
    cnpj: string;
    name: boolean | null;
    qsa: boolean | null
}

// GET /api/sheets
export async function GET(req: NextRequest) {
    const body: Filters = await req.json();
    const cnpj = body.cnpj.toString()

    if (!body) {
        return NextResponse.json(
            { error: "Dados inválidos" },
            { status: 400 }
        )
    }

    const company = await prisma.company.findUnique({
        where: { cnpj },
        select: {
            name: true,
            qsas: true
        }
    })

    return NextResponse.json({
        name: company?.name ?? null,
        qsa: company?.qsas ?? null,
    })
}