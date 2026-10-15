import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { active: true } });
  if (!account?.active) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  // Keep the existing global company search permission boundary.
  if (user.role === "USER") return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 120);
  if (q.length < 2) return NextResponse.json({ items: [] });
  const digits = q.replace(/\D/g, "");
  const [companies, partners, qsas] = await Promise.all([
    prisma.company.findMany({
      where: { deletedAt: null, OR: [{ name: { contains: q, mode: "insensitive" } },
        ...(digits ? [{ cnpj: { contains: digits } }] : [])] },
      select: { cnpj: true, name: true }, orderBy: [{ name: "asc" }, { cnpj: "asc" }], take: 12,
    }),
    prisma.profitPartner.findMany({
      where: { company: { deletedAt: null }, OR: [{ name: { contains: q, mode: "insensitive" } },
        ...(digits ? [{ cpf: { contains: digits } }] : [])] },
      select: { id: true, name: true, cpf: true, qsaPeriods: true,
        company: { select: { cnpj: true, name: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }], take: 12,
    }),
    prisma.companyQsa.findMany({
      where: { deletedAt: null, company: { deletedAt: null }, nome: { contains: q, mode: "insensitive" } },
      select: { id: true, nome: true, company: { select: {
        cnpj: true, name: true, qsas: { where: { deletedAt: null }, orderBy: { id: "asc" }, select: { id: true } },
        profitPartners: { select: { name: true } },
      } } },
      orderBy: [{ nome: "asc" }, { id: "asc" }], take: 12,
    }),
  ]);
  const years = await prisma.referenceYear.findMany({ orderBy: { year: "desc" } });
  const { partnerVisibility } = await import("@/lib/partner-periods.mjs");
  const { normalizeDistributionSearch } = await import("@/lib/profit-distribution-input");
  const preferredYears = [...years.filter(item => item.year <= new Date().getFullYear()),
    ...years.filter(item => item.year > new Date().getFullYear()).reverse()];
  return NextResponse.json({ items: [
    ...companies.map(company => ({ ...company, kind: "company" })),
    ...partners.map(partner => ({
      kind: "partner", cnpj: partner.company.cnpj, name: partner.name,
      companyName: partner.company.name, partnerId: partner.id, cpf: partner.cpf,
      year: preferredYears.find(item => partnerVisibility(partner.qsaPeriods, item.year).visibleMonths.length)?.year,
    })),
    ...qsas.filter(qsa => !qsa.company.profitPartners.some(partner =>
      normalizeDistributionSearch(partner.name) === normalizeDistributionSearch(qsa.nome))).map(qsa => ({
      kind: "partner", cnpj: qsa.company.cnpj, name: qsa.nome, companyName: qsa.company.name,
      partnerId: -(qsa.company.qsas.findIndex(item => item.id === qsa.id) + 1),
      cpf: null, year: preferredYears[0]?.year,
    })),
  ] }, { headers: { "Cache-Control": "private, no-store" } });
}
