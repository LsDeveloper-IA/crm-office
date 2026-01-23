import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTy5agvCnMhLz83s5JLOiRzrlczrQW51XkhtxwCKgYor-9r6y2I7AzwFthV_NgZUA/pub?gid=2081804269&single=true&output=csv";

const FIXED_SECTOR_ID = 1;
const LIMITE_ATUALIZACOES = 2; // 👈 controle de teste

const CHAVES = [
  "nomeEmpresa",
  "cnpj",
  "responsavelSetor",
];

export async function PATCH() {
  /**
   * 1️⃣ Busca o CSV
   */
  const response = await fetch(CSV_URL);

  if (!response.ok) {
    return NextResponse.json(
      { error: "Erro ao buscar CSV da planilha" },
      { status: 500 }
    );
  }

  const csv = await response.text();
  const linhas = csv.split("\n").filter(Boolean);

  /**
   * 2️⃣ Converte CSV → objetos
   * ignora cabeçalho (linha 0)
   */
  const registros = linhas.slice(1).map((linha) => {
    const valores = linha.split(",");
    const obj: any = {};

    CHAVES.forEach((chave, index) => {
      obj[chave] = valores[index]?.trim() || null;
    });

    return obj;
  });

  /**
   * 3️⃣ Resultado de execução
   */
  const resultado = {
    processados: 0,
    setoresGarantidos: 0,
    responsaveisCriados: 0,
    interrompidoEm: null as string | null,
    erros: [] as any[],
  };

  /**
   * 4️⃣ Processa registros
   */
  for (const item of registros) {
    if (resultado.processados >= LIMITE_ATUALIZACOES) {
      resultado.interrompidoEm = item.cnpj;
      break; // ⛔ interrupção controlada
    }

    const cnpj = item.cnpj?.replace(/\D/g, "");

    if (!cnpj || cnpj.length !== 14) {
      resultado.erros.push({
        cnpj: item.cnpj,
        erro: "CNPJ inválido",
      });
      resultado.processados++;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        /**
         * 5️⃣ Garante o setor fixo (não altera dados existentes)
         */
        const companySector = await tx.companySector.upsert({
          where: {
            companyCnpj_sectorId: {
              companyCnpj: cnpj,
              sectorId: FIXED_SECTOR_ID,
            },
          },
          update: {}, // 👈 NÃO altera nada
          create: {
            companyCnpj: cnpj,
            sectorId: FIXED_SECTOR_ID,
          },
        });

        resultado.setoresGarantidos++;

        /**
         * 6️⃣ Cria UM NOVO responsável
         * (sem apagar nem sobrescrever os existentes)
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
    } catch (err: any) {
      resultado.erros.push({
        cnpj,
        erro: err.message,
      });
    }

    resultado.processados++;
  }

  /**
   * 7️⃣ Retorno final
   */
  return NextResponse.json(resultado);
}
