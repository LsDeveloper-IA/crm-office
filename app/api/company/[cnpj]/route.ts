import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type Params = {
  params: Promise<{
    cnpj: string;
  }>;
};

export async function GET(_: Request, { params }: Params) {
  const { cnpj: rawCnpj } = await params;

  const cnpj = rawCnpj.replace(/\D/g, "");

  if (!cnpj || cnpj.length !== 14) {
    return NextResponse.json(
      { error: "CNPJ inválido" },
      { status: 400 }
    );
  }

  const company = await prisma.company.findUnique({
    where: { cnpj },
    select: {
      cnpj: true,
      name: true,

      profile: {
        select: {
          taxRegime: true,
          accountant: true,
        },
      },

      publicSpace: true,
      number: true,
      district: true,
      city: true,
      state: true,

      companySectors: {
        select: {
          sector: { select: { name: true } },
          owner: { select: { username: true } },
        },
      },
    },
  });

  if (!company) {
    return NextResponse.json(
      { error: "Empresa não encontrada" },
      { status: 404 }
    );
  }

  return NextResponse.json(company);
}