import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTy5agvCnMhLz83s5JLOiRzrlczrQW51XkhtxwCKgYor-9r6y2I7AzwFthV_NgZUA/pub?gid=2081804269&single=true&output=csv";

// const LIMITE_ATUALIZACOES = 2; ahajhbakl

const CHAVES = [
  "nomeEmpresa",
  "cnpj",
  "paysfree",
];

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

  const registros = linhas.slice(3).map((linha) => {
    const valores = linha.split(",");
    const obj: any = {};

    CHAVES.forEach((chave, index) => {
      obj[chave] = valores[index]?.trim() || null;
    });

    return obj;
  });

  const resultado = {
    processados: 0,
    atualizados: 0,
    interrompidoEm: null as string | null,
    erros: [] as any[],
  };

  for (const item of registros) {
    // if (resultado.processados >= LIMITE_ATUALIZACOES) {
    //   resultado.interrompidoEm = item.cnpj;
    //   break;
    // }

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
      const updated = await prisma.companyProfile.updateMany({
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
    } catch (err: any) {
      resultado.erros.push({
        cnpj,
        erro: err.message,
      });
    }

    resultado.processados++;
  }

  return NextResponse.json(resultado);
}
