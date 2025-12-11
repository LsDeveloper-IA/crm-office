// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Rotas privadas (adicione aqui todas as rotas que devem exigir login)
 * IMPORTANTE: lista estática — não a construa dinamicamente.
 */
const PROTECTED_PATHS = [
  "/dashboard",
  "/dashboard/:path*",
  "/app",
  "/app/:path*",
  "/companies",
  "/companies/:path*",
  "/admin",
  "/admin/:path*",
  "/settings",
  "/settings/:path*",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Se a rota não for uma das protegidas, deixa passar
  const isProtected = PROTECTED_PATHS.some((p) => {
    // Next já suporta o matcher, aqui só detectamos rapidamente se é um caminho protegido
    // Observe: esta checagem é simples; a autorização definitiva deve ser feita no server-side (API / server components)
    if (p.endsWith("/:path*")) {
      const base = p.replace("/:path*", "");
      return pathname === base || pathname.startsWith(base + "/");
    }
    return pathname === p;
  });

  if (!isProtected) {
    return NextResponse.next();
  }

  // Se for protegida, checa se cookie token existe
  const token = req.cookies.get("token")?.value;
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  // Se houver cookie, permite (validação final no servidor)
  return NextResponse.next();
}

// Export estático com arrays de matchers (obrigatório ser estático)
export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/app",
    "/app/:path*",
    "/companies",
    "/companies/:path*",
    "/admin",
    "/admin/:path*",
    "/settings",
    "/settings/:path*",
  ],
};