// app/api/auth/login/route.ts
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import prisma from "@/lib/prisma"; // ajuste se necessário
import type { NextRequest } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN ?? "7d";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not set in environment variables.");
}

const secret: Secret = JWT_SECRET as Secret;
const signOptions = { expiresIn: JWT_EXPIRES_IN } as SignOptions;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = (body.username ?? "").toString().trim();
    const password = (body.password ?? "").toString();

    if (!username || !password) {
      return NextResponse.json({ error: "username and password are required" }, { status: 400 });
    }

    // Busca usuário
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, password: true, role: true, active: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    if (!user.active) {
      return NextResponse.json({ error: "User is disabled" }, { status: 403 });
    }

    // Verifica senha
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Gera token JWT (CORREÇÃO: use sign, não sing)
    const tokenPayload = { sub: user.id, username: user.username, role: user.role };
    const token = jwt.sign(tokenPayload as Record<string, unknown>, secret, signOptions);

    // Resposta com cookie httpOnly
    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, username: user.username, role: user.role },
    });

    // define cookie seguro
    res.cookies.set({
      name: "token",
      value: token,
      httpOnly: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 dias em segundos
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}