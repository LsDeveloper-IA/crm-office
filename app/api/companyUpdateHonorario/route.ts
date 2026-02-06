import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTy5agvCnMhLz83s5JLOiRzrlczrQW51XkhtxwCKgYor-9r6y2I7AzwFthV_NgZUA/pub?gid=2081804269&single=true&output=csv";

// const LIMITE_ATUALIZACOES = 2;

const CHAVES = ["nomeEmpresa", "cnpj", "paysfree"] as const;

type Registro = {
  nomeEmpresa: string | null;
  cnpj: string | null;
  paysfree: string | null;
};

type Resultado = {
  processados: number;
  atualizados: number;
  interrompidoEm: string | null;
  erros: Array<{ cnpj: string | null; erro: string }>;
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

  const registros = linhas.slice(1).map((linha) => {
    const valores = linha.split(",");
    const obj: Partial<Registro> = {};

    CHAVES.forEach((chave, index) => {
      obj[chave] = valores[index]?.trim() || null;
    });

    return {
      nomeEmpresa: obj.nomeEmpresa ?? null,
      cnpj: obj.cnpj ?? null,
      paysfree: obj.paysfree ?? null,
    };
  });

  const resultado: Resultado = {
    processados: 0,
    atualizados: 0,
    interrompidoEm: null,
    erros: [],
  };

  for (const item of registros) {

    const cnpj = item.cnpj?.replace(/\D/g, "");

    if (!cnpj || cnpj.length !== 14) {
      resultado.erros.push({
        cnpj: item.cnpj,
        erro: "CNPJ inválido",
      });
      continue;
    }

    const paysFees =
      item.paysfree?.toLowerCase() === "sim";

    if (!paysFees) {
      resultado.processados++;
      continue;
    }

    try {
      const updated = await prisma.companyProfile.update({
        where: {
          companyCnpj: cnpj,
        },
        data: {
          paysFees: true,
        },
      });

      if (updated.count === 0) {
        resultado.erros.push({
          cnpj,
          erro: "CompanyProfile não encontrado",
        });
      } else {
        resultado.atualizados++;
      }
    } catch (err: unknown) {
      resultado.erros.push({
        cnpj,
        erro: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }

    resultado.processados++;
  }

  return NextResponse.json(resultado);
}
