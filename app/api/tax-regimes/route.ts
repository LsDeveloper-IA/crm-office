import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const regimes = await prisma.taxRegime.findMany({
      orderBy: { name: "asc" },
      select: {
        key: true,
        name: true,
      },
    });

    return NextResponse.json(regimes);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Erro ao buscar regimes tributários" },
      { status: 500 }
    );
  }
}