import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTy5agvCnMhLz83s5JLOiRzrlczrQW51XkhtxwCKgYor-9r6y2I7AzwFthV_NgZUA/pub?gid=2081804269&single=true&output=csv";

const FIXED_SECTOR_ID = 3;
const LIMITE_ATUALIZACOES = 2; // 👈 CONTROLE AQUI

const CHAVES = [
  "nomeEmpresa",
  "cnpj",
  "responsavelSetor",
] as const;

type Registro = {
  nomeEmpresa: string | null;
  cnpj: string | null;
  responsavelSetor: string | null;
};

type ResultadoErro = {
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

  const registros: Registro[] = linhas.slice(1).map((linha) => {
    const valores = linha.split(",");
    const obj: Record<(typeof CHAVES)[number], string | null> = {
      nomeEmpresa: null,
      cnpj: null,
      responsavelSetor: null,
    };

    CHAVES.forEach((chave, index) => {
      obj[chave] = valores[index]?.trim() || null;
    });

    return obj;
  });

  const resultado: {
    processados: number;
    setoresCriados: number;
    responsaveisCriados: number;
    interrompidoEm: string | null;
    erros: ResultadoErro[];
  } = {
    processados: 0,
    setoresCriados: 0,
    responsaveisCriados: 0,
    interrompidoEm: null as string | null,
    erros: [],
  };

  for (const item of registros) {
    if (resultado.processados >= LIMITE_ATUALIZACOES) {
      resultado.interrompidoEm = item.cnpj;
      break; // ⛔ para a execução
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
         * 1️⃣ Garante o setor fixo
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
         * 2️⃣ Cria um NOVO responsável (sem apagar os anteriores)
         */
        if (item.responsavelSetor?.trim()) {
          await tx.companySectorOwner.create({
            data: {
              companySectorId: companySector.id,
              name: item.responsavelSetor.trim(),
            },
          });

          resultado.responsaveisCriados++;
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
