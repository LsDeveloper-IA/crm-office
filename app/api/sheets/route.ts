import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";


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
    page?: string;
    sort?: string;
    dir?: "asc" | "desc";
    group?: string;
}

type SheetRequestBody = {
    paramsObject?: Params;
    filters: Filters;
}

type SheetCompany = {
    name?: string | null;
    cnpj?: string;
    profile?: {
        thirteenth?: boolean;
        paysFees?: boolean;
        accountant?: string | null;
        taxRegime?: {
            name: string;
        } | null;
    } | null;
    companySectors?: Array<{
        ownerName: string | null;
    }>;
    qsas?: Array<{
        nome: string;
    }>;
    activities?: Array<{
        description: string | null;
    }>;
}

const PAGE_SIZE = 13

// 🔒 mapa seguro de ordenação
const SORT_MAP: Record<string, Prisma.CompanyOrderByWithRelationInput> = {
  name: { name: "asc" },
  cnpj: { cnpj: "asc" },

  paysFees: {
    profile: {
      paysFees: "asc",
    },
  },

  taxRegime: {
    profile: {
      taxRegime: {
        name: "asc",
      },
    },
  },

  accountant: {
    profile: {
      accountant: "asc",
    },
  },

  thirteenth: {
    profile: {
      thirteenth: "asc"
    }
  }
};

function buildSelect(filters: Filters) {
    const select: Prisma.CompanySelect = {};

    if (filters.nome) select.name = true;
    if (filters.cnpj) select.cnpj = true;
    
    if (filters.socios) select.qsas = true;

    if (filters.decimoTerceiro || filters.honorario || filters.contador || filters.regime) {
        const profileSelect: Prisma.CompanyProfileSelect = {};

        if (filters.decimoTerceiro) profileSelect.thirteenth = true;
        if (filters.honorario) profileSelect.paysFees = true;
        if (filters.contador) profileSelect.accountant = true;
        if (filters.regime) profileSelect.taxRegime = { select: { key: true, name: true } };

        select.profile = { select: profileSelect };
    }

    if (filters.atividades) { select.activities = { select: { description: true } } }
    if (filters.responsaveis) { select.companySectors = { select: { ownerName: true } } }

    return select;
}

// POST /api/sheets
export async function POST(req: NextRequest) {
    
    try {
        const body: SheetRequestBody = await req.json();  
        const params: Params = body.paramsObject ?? {};
        const filters: Filters = body.filters

        const page = Math.max(Number(params.page) || 1, 1)
        const skip = (page - 1) * PAGE_SIZE;

        const sortKey = params.sort ?? "name";
        const dir = params.dir === "desc" ? "desc" : "asc";
        
        // 🛡️ fallback seguro
        const baseOrder = SORT_MAP[sortKey] ?? SORT_MAP.name;
    
        // 🔁 aplica direção (asc/desc) corretamente
        const orderBy = JSON.parse(
        JSON.stringify(baseOrder).replace(/"asc"/g, `"${dir}"`)
        );
    
        const where: Prisma.CompanyWhereInput = params.group
        ? {
            profile: {
                is: {
                group: params.group,
                },
            },
            }
        : {};

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Empresas");

        const columns = [];

        if (filters.nome) columns.push({ header: "Nome", key: "nome", width: 128 });
        if (filters.cnpj) columns.push({ header: "CNPJ", key: "cnpj", width: 32 });
        if (filters.decimoTerceiro) columns.push({ header: "13°", key: "decimoTerceiro", width: 8 });
        if (filters.honorario) columns.push({ header: "Honorário", key: "honorario", width: 8 });
        if (filters.regime) columns.push({ header: "Regime Tributário", key: "regime", width: 24 });
        if (filters.contador) columns.push({ header: "Contador", key: "contador", width: 16 });
        if (filters.responsaveis) columns.push({ header: "Responsável", key: "responsaveis", width: 64 });
        if (filters.socios) columns.push({ header: "Sócios", key: "socios", width: 128 });
        if (filters.atividades) columns.push({ header: "Atividades", key: "atividades", width: 512 });

        worksheet.columns = columns;

        let companies: SheetCompany[] = [];

        if(!filters.todasAsEmpresas) {
            companies = await prisma.company.findMany({
                where,
                orderBy,
                skip,
                take: PAGE_SIZE,
                select: buildSelect(filters),
            })
        }
        
        if (filters.todasAsEmpresas) {
            companies = await prisma.company.findMany({ select: buildSelect(filters) })
        }

        companies.forEach((company) => {
            worksheet.addRow({
                nome: company.name,
                cnpj: company.cnpj,
                decimoTerceiro: company.profile?.thirteenth,
                honorario: company.profile?.paysFees,
                contador: company.profile?.accountant,
                regime: company.profile?.taxRegime?.name,
                responsaveis: company.companySectors?.map((sector) => sector.ownerName).join(", "),
                socios: company.qsas?.map((qsa) => qsa.nome).join(", "),
                atividades: company.activities?.map((activity) => activity.description).join(", "),
            })
        })

        const buffer = await workbook.xlsx.writeBuffer();

        return new NextResponse(buffer, {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": "attachment; filename=empresas.xlsx",
            },
        });
    }

    catch {
        return NextResponse.json(
            { error: "Erro ao buscar empresas" },
            { status: 500 }
        )
    }
}
