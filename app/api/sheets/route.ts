import prisma from "@/lib/prisma";
import { error } from "console";
import { NextRequest, NextResponse } from "next/server";

// GET /api/sheets
export async function GET(req: NextRequest) {
    const body = await req.body;

    if (!body) {
        return NextResponse.json(
            { error: "Dados inválidos" },
            { status: 400 }
        )
    }
}