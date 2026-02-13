import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";


type Filters = {
    nome: boolean;
    cnpj: boolean;
    decimoTerceiro: boolean;
    honorario: boolean;
    regime: boolean;
    contador: boolean;
    responsaveis: boolean;
    socios: boolean;
    atividades: boolean;
    todasAsEmpresas: boolean;
}

type Params = {
    page: string | null;
}

const PAGE_SIZE = 13

// POST /api/sheets
export async function POST(req: NextRequest) {
    
    try {
        const body = await req.json();
        const params: Params = body.paramsObject ?? null
        const filters: Filters = body.filters

        const page = Math.max(Number(params.page) || 1, 1)
        const skip = (page - 1) * PAGE_SIZE;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Empresas");

        const columns = [];

        if (filters.nome) columns.push({ header: "Nome", key: "nome", width: 128 });
        if (filters.cnpj) columns.push({ header: "CNPJ", key: "cnpj", width: 32 });
        if (filters.decimoTerceiro) columns.push({ header: "13°", key: "decimoTerceiro", width: 8 });
        if (filters.honorario) columns.push({ header: "Honorário", key: "honorario", width: 8 });
        if (filters.regime) columns.push({ header: "Regime Tributário", key: "regime", width: 16 });
        if (filters.contador) columns.push({ header: "Contador", key: "contador", width: 16 });
        if (filters.responsaveis) columns.push({ header: "Responsável", key: "responsaveis", width: 128 });
        if (filters.socios) columns.push({ header: "Sócios", key: "socios", width: 128 });
        if (filters.atividades) columns.push({ header: "Atividades", key: "atividades", width: 128 });

        worksheet.columns = columns;

        if(!filters.todasAsEmpresas) {
            const companies = await prisma.company.findMany({
                skip,
                take: PAGE_SIZE,
                select: {
                    name: filters.nome,
                    cnpj: filters.cnpj,

                    qsas: {
                        select: {
                            nome: filters.socios,
                        }
                    },

                    profile: {
                        select: {
                            thirteenth: filters.decimoTerceiro,
                            paysFees: filters.honorario,
                            accountant: filters.contador,
                        }
                    },

                    activities: {
                        select: {
                            description: filters.atividades,
                        }
                    },

                    companySectors: {
                        select: {
                            ownerName: filters.responsaveis
                        }
                    }
                }
            })
        }

        if (filters.todasAsEmpresas) {
            const companies = prisma.company.findMany({
                select: {
                    name: filters.nome,
                    cnpj: filters.cnpj,

                    qsas: {
                        select: {
                            nome: filters.socios,
                        }
                    },

                    profile: {
                        select: {
                            thirteenth: filters.decimoTerceiro,
                            paysFees: filters.honorario,
                            accountant: filters.contador,
                        }
                    },

                    activities: {
                        select: {
                            description: filters.atividades,
                        }
                    },

                    companySectors: {
                        select: {
                            ownerName: filters.responsaveis
                        }
                    }
                }
            })
        }

        companies.forEach((company) => {
            worksheet.addRow({
                nome: company.name,
                cnpj: company.cnpj,
                decimoTerceiro: company.profile.thirteenth,
                honorario: company.profile.paysFees,
                contador: company.profile.accountant,
                responsaveis: company.companySectors.ownerName,
                socios: company.qsas.nome,
                atividades: company.activies.description,
            })
        })
    }

    catch(error) {
        return NextResponse.json(
            { error: "Erro ao buscar empresas" },
            { status: 500 }
        )
    }
}