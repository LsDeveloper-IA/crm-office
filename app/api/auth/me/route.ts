import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import prisma from "@/lib/prisma";

const JWT_SECRET = process.env.JWT_SECRET!;

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const payload = jwt.verify(token, JWT_SECRET) as { sub?: number; username?: string; role?: string } | null;

    if (!payload?.sub) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: Number(payload.sub) },
      select: { id: true, username: true, role: true, active: true },
    });

    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    if (!user.active) {
      return NextResponse.json({ authenticated: false }, { status: 403 });
    }

    return NextResponse.json({ authenticated: true, user });
  } catch (err) {
    console.error("auth/me error:", err);
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}