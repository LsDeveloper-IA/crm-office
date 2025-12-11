// debug versão - app/api/auth/me/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export async function GET(req: NextRequest) {
  try {
    const tokenFromCookie = req.cookies.get("token")?.value;
    const authHeader = req.headers.get("authorization");

    // Log para console do servidor
    console.log("tokenFromCookie:", tokenFromCookie);
    console.log("authorization header:", authHeader);

    // fallback: se veio Authorization, extraia Bearer
    const token = tokenFromCookie ?? (authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined);

    if (!token) {
      return NextResponse.json({ authenticated: false, reason: "no_token" }, { status: 401 });
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET);
      return NextResponse.json({ authenticated: true, payload });
    } catch (err) {
      console.error("jwt verify failed:", err);
      return NextResponse.json({ authenticated: false, reason: "invalid_token" }, { status: 401 });
    }
  } catch (err) {
    console.error("me debug error:", err);
    return NextResponse.json({ authenticated: false, reason: "server_error" }, { status: 500 });
  }
}