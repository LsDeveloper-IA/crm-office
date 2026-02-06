import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTy5agvCnMhLz83s5JLOiRzrlczrQW51XkhtxwCKgYor-9r6y2I7AzwFthV_NgZUA/pub?gid=2081804269&single=true&output=csv";

const LIMITE_ATUALIZACOES = 2; // 👈 CONTROLE AQUI
const FIXED_SECTOR_ID = 2;

const CHAVES = [
  "nomeEmpresa", // ignorado
  "cnpj",
  "responsavel",
] as const;

type CsvRow = {
  nomeEmpresa: string | null;
  cnpj: string | null;
  responsavel: string | null;
};

type ErrorItem = {
  cnpj: string | null;
  erro: string;
};

export async function PATCH() {
  const response = await fetch(CSV_URL);

  if (!response.ok) {
    return NextResponse.json(
      { error: "Erro ao buscar CSV da planilha" },
      { status: 500 }
    );
  }

  const csv = await response.text();
  const linhas = csv.split("\n").filter(Boolean);

  const registros: CsvRow[] = linhas.slice(3).map((linha) => {
    const valores = linha.split(",");

    const obj: CsvRow = {
      nomeEmpresa: null,
      cnpj: null,
      responsavel: null,
    };

    CHAVES.forEach((chave, index) => {
      obj[chave] = valores[index]?.trim() || null;
    });

    return obj;
  });

  const resultado = {
    processados: 0,
    interrompidoEm: null as string | null,
    erros: [] as ErrorItem[],
  };

  for (const item of registros) {
    if (resultado.processados >= LIMITE_ATUALIZACOES) {
      resultado.interrompidoEm = item.cnpj;
      break; // ⛔ trava controlada
    }

    const cnpj = item.cnpj?.replace(/\D/g, "");

    if (!cnpj || cnpj.length !== 14) {
      resultado.erros.push({
        cnpj: item.cnpj,
        erro: "CNPJ inválido",
      });
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        /**
         * 1️⃣ Empresa
         */
        const company = await tx.company.findUnique({
          where: { cnpj },
        });

        if (!company) {
          throw new Error("Empresa não encontrada");
        }

        /**
         * 2️⃣ Garante CompanySector
         */
        const companySector = await tx.companySector.upsert({
          where: {
            companyCnpj_sectorId: {
              companyCnpj: cnpj,
              sectorId: FIXED_SECTOR_ID,
            },
          },
          update: {},
          create: {
            companyCnpj: cnpj,
            sectorId: FIXED_SECTOR_ID,
          },
        });

        /**
         * 3️⃣ Cria responsável (NOVO MODELO)
         */
        if (item.responsavel?.trim()) {
          await tx.companySectorOwner.create({
            data: {
              companySectorId: companySector.id,
              name: item.responsavel.trim(),
            },
          });
        }
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado";

      resultado.erros.push({
        cnpj,
        erro: message,
      });
    }

    resultado.processados++;
  }

  return NextResponse.json(resultado);
}
