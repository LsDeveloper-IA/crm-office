import { fetchCompanyFromReceita } from "@/lib/1receita";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTy5agvCnMhLz83s5JLOiRzrlczrQW51XkhtxwCKgYor-9r6y2I7AzwFthV_NgZUA/pub?gid=2081804269&single=true&output=csv";

const UPDATE_MAX = 2;
const CHAVES = ["decimoTerceiro", "nomeEmpresa", "cnpj"] as const;

type Registro = {
    decimoTerceiro: string | null,
    nomeEmpresa: string | null,
    cnpj: string | null,
}

type Resultado = {
    processados: number,
    atualizados: number,
    interrompidoEm: string | null,
    erros: Array<{cnpj: string | null, erro: string}>,
}

// POST api/companyUpdateThirteenth
export async function POST() {
    const response = await fetch(CSV_URL);

    if(!response.ok) {
        return NextResponse.json(
            { error: "Erro ao buscar o CSV da planilha" },
            { status: 500 }
        )
    }

    const csv = await response.text()
    const linhas = csv.split("\n").filter(Boolean)

    const registros = linhas.slice(1).map((linha) => {
        const valores = linha.split(",");
        const obj: Partial<Registro> = {};

        CHAVES.forEach((chave, index) => {
            (obj as any)[chave] = valores[index]?.trim() || null;
        })

        return {
            decimoTerceiro: obj.decimoTerceiro ?? null,
            nomeEmpresa: obj.nomeEmpresa ?? null,
            cnpj: obj.cnpj ?? null,
        };
    });

    const resultado: Resultado = {
        processados: 0,
        atualizados: 0,
        interrompidoEm: null,
        erros: [],
    }

    for (const item of registros) {
        if (resultado.processados >= UPDATE_MAX) {
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

        const decimoTerceiro = item.decimoTerceiro?.toLowerCase() === "sim";

        if(!decimoTerceiro) {
            resultado.processados++;
            continue;
        }

        try {
            const update = await prisma.companyProfile.update({
                where: {
                    companyCnpj: cnpj
                },
                data: {
                    thirteenth: true
                },
            })

            if(update.count === 0) {
                resultado.erros.push({
                    cnpj,
                    erro: "CompanyProfile não encontrado",
                });
            } else {
                resultado.atualizados++;
            }
        } catch(err: unknown) {
            resultado.erros.push({
                cnpj,
                erro: err instanceof Error ? err.message : "Erro desconhecido",
            });
        }
    }

    return NextResponse.json(resultado);
}