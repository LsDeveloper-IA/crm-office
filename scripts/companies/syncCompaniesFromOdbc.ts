import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";

export type OdbcCompany = {
    cnpj?: string | null;
    name?: string | null;
    aliases?: string[] | null;
    fantasy?: string | null;
    email?: string | null;
    telephone?: string | null;
    publicSpace?: string | null;
    number?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
    contacts?: Array<Record<string, unknown>> | null;
    partners?: string[] | null;
};

export type CrmCompany = {
    cnpj: string;
    name?: string | null;
    deletedAt: Date | null;
};

export function normalizeCnpj(value: string | null | undefined): string | null {
    if (value == null) return null;

    const digits = String(value).replace(/\D/g, "");
    return digits.length === 14 ? digits : null;
}

function normalizeCompanyName(value: string | null | undefined): string | null {
    const normalized = String(value ?? "").trim();
    return normalized ? normalized.toLowerCase().replace(/\s+/g, " ") : null;
}

export function buildSyncPlan(
    odbcCompanies: OdbcCompany[],
    crmCompanies: CrmCompany[]
) {
    const crmByCnpj = new Map<string, CrmCompany>();
    const crmByName = new Map<string, CrmCompany>();

    for (const company of crmCompanies) {
        const cnpj = normalizeCnpj(company.cnpj);
        const name = normalizeCompanyName((company as { name?: string | null }).name ?? null);

        if (cnpj && !crmByCnpj.has(cnpj)) {
            crmByCnpj.set(cnpj, company);
        }

        if (name && !crmByName.has(name)) {
            crmByName.set(name, company);
        }
    }

    const odbcSet = new Set<string>();
    const odbcNameSet = new Set<string>();
    const toCreate: OdbcCompany[] = [];
    const toRestore: string[] = [];
    const toRestoreByName: string[] = [];
    const toKeep: string[] = [];

    for (const company of odbcCompanies) {
        const cnpj = normalizeCnpj(company.cnpj);
        const name = normalizeCompanyName(company.name);

        if (cnpj) {
            odbcSet.add(cnpj);
        }

        if (name) {
            odbcNameSet.add(name);
        }

        const crmCompany = cnpj ? crmByCnpj.get(cnpj) : undefined;
        const matchedCrmCompany = crmCompany ?? (name ? crmByName.get(name) : undefined);

        if (!matchedCrmCompany) {
            if (cnpj) {
                toCreate.push({ ...company, cnpj });
            }
            continue;
        }

        if (matchedCrmCompany.deletedAt) {
            if (cnpj) {
                toRestore.push(cnpj);
            } else if (name) {
                toRestoreByName.push(name);
            }
            continue;
        }

        if (cnpj) {
            toKeep.push(cnpj);
        }
    }

    const toArchive: string[] = [];
    const toArchiveByName: string[] = [];

    for (const company of crmCompanies) {
        const cnpj = normalizeCnpj(company.cnpj);
        const name = normalizeCompanyName((company as { name?: string | null }).name ?? null);

        const hasCnpjMatch = Boolean(cnpj && odbcSet.has(cnpj));
        const hasNameMatch = !cnpj && Boolean(name && odbcNameSet.has(name));

        if (!hasCnpjMatch && !hasNameMatch) {
            if (cnpj) {
                toArchive.push(cnpj);
            } else if (name) {
                toArchiveByName.push(name);
            }
        }
    }

    const archived = crmCompanies
        .filter((company) => {
            const cnpj = normalizeCnpj(company.cnpj);
            const name = normalizeCompanyName((company as { name?: string | null }).name ?? null);
            const hasCnpjMatch = Boolean(cnpj && odbcSet.has(cnpj));
            const hasNameMatch = Boolean(name && odbcNameSet.has(name));
            return companyIsArchived(company) && Boolean(cnpj) && (hasCnpjMatch || hasNameMatch);
        })
        .map((company) => normalizeCnpj(company.cnpj) as string)
        .filter((cnpj, index, list) => list.indexOf(cnpj) === index);

    return {
        toCreate,
        toRestore,
        toRestoreByName,
        toArchive,
        toArchiveByName,
        toKeep,
        archived,
    };
}

function companyIsArchived(company: CrmCompany): boolean {
    return Boolean(company.deletedAt);
}

export function readOdbcSnapshot(): OdbcCompany[] {
    const rootDir = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
    const pythonCommand = process.platform === "win32" ? "python" : "python3";

    const output = execFileSync(
        pythonCommand,
        ["-m", "Banco.exportar_empresas"],
        {
            cwd: rootDir,
            encoding: "utf-8",
            env: {
                ...process.env,
                PYTHONPATH: rootDir,
            },
            stdio: ["ignore", "pipe", "pipe"],
        }
    );

    const parsed = JSON.parse(output) as {
        companies?: OdbcCompany[];
    };

    return Array.isArray(parsed.companies) ? parsed.companies : [];
}

export async function applySyncPlan(
    plan: ReturnType<typeof buildSyncPlan>,
    prisma: PrismaClient
) {
    const toCreate = plan.toCreate.filter((company) => normalizeCnpj(company.cnpj));

    for (const company of toCreate) {
        const cnpj = normalizeCnpj(company.cnpj);
        if (!cnpj) continue;

        await prisma.company.upsert({
            where: { cnpj },
            update: {
                name: company.name ?? null,
                fantasy: company.fantasy ?? null,
                email: company.email ?? null,
                telephone: company.telephone ?? null,
                publicSpace: company.publicSpace ?? null,
                number: company.number ?? null,
                district: company.district ?? null,
                city: company.city ?? null,
                state: company.state ?? null,
                zipCode: company.zipCode ?? null,
                deletedAt: null,
            },
            create: {
                cnpj,
                name: company.name ?? "Empresa sem nome",
                fantasy: company.fantasy ?? null,
                email: company.email ?? null,
                telephone: company.telephone ?? null,
                publicSpace: company.publicSpace ?? null,
                number: company.number ?? null,
                district: company.district ?? null,
                city: company.city ?? null,
                state: company.state ?? null,
                zipCode: company.zipCode ?? null,
            },
        });
    }

    if (plan.toRestore.length > 0) {
        await prisma.company.updateMany({
            where: { cnpj: { in: plan.toRestore } },
            data: { deletedAt: null },
        });
    }

    if (plan.toRestoreByName.length > 0) {
        await prisma.company.updateMany({
            where: {
                deletedAt: { not: null },
                name: { in: plan.toRestoreByName, mode: "insensitive" },
            },
            data: { deletedAt: null },
        });
    }

    const namesToDelete = plan.toArchiveByName;
    const companiesToDelete = new Set(plan.toArchive);

    if (namesToDelete.length > 0) {
        const companiesByName = await prisma.company.findMany({
            where: { name: { in: namesToDelete, mode: "insensitive" } },
            select: { cnpj: true },
        });

        for (const company of companiesByName) {
            companiesToDelete.add(company.cnpj);
        }
    }

    if (companiesToDelete.size > 0) {
        const cnpjs = [...companiesToDelete];

        await prisma.$transaction([
            prisma.note.deleteMany({ where: { companyCnpj: { in: cnpjs } } }),
            prisma.note.deleteMany({
                where: { companySector: { companyCnpj: { in: cnpjs } } },
            }),
            prisma.companySectorOwner.deleteMany({
                where: { companySector: { companyCnpj: { in: cnpjs } } },
            }),
            prisma.companySector.deleteMany({ where: { companyCnpj: { in: cnpjs } } }),
            prisma.companyActivity.deleteMany({ where: { companyCnpj: { in: cnpjs } } }),
            prisma.companySystem.deleteMany({ where: { companyCnpj: { in: cnpjs } } }),
            prisma.companyQsa.deleteMany({ where: { companyCnpj: { in: cnpjs } } }),
            prisma.contact.deleteMany({ where: { companyCnpj: { in: cnpjs } } }),
            prisma.attachment.deleteMany({ where: { companyCnpj: { in: cnpjs } } }),
            prisma.certificate.deleteMany({ where: { companyCnpj: { in: cnpjs } } }),
            prisma.companyProfile.deleteMany({ where: { companyCnpj: { in: cnpjs } } }),
            prisma.profitDistribution.deleteMany({ where: { companyCnpj: { in: cnpjs } } }),
            prisma.profitPartner.deleteMany({ where: { companyCnpj: { in: cnpjs } } }),
            prisma.company.deleteMany({ where: { cnpj: { in: cnpjs } } }),
        ]);
    }

    return {
        created: toCreate.length,
        restored: plan.toRestore.length + plan.toRestoreByName.length,
        archived: companiesToDelete.size,
        kept: plan.toKeep.length,
    };
}

export async function syncCompaniesFromOdbc() {
    const { default: prisma } = await import("../../lib/prisma");
    const odbcCompanies = readOdbcSnapshot();
    const crmCompanies = await prisma.company.findMany({
        select: {
            cnpj: true,
            name: true,
            deletedAt: true,
        },
    });

    const plan = buildSyncPlan(odbcCompanies, crmCompanies);
    const result = await applySyncPlan(plan, prisma);

    return {
        ...result,
        snapshotCount: odbcCompanies.length,
        crmCount: crmCompanies.length,
        plan,
    };
}

function runOnce() {
    syncCompaniesFromOdbc()
        .then((result) => {
            console.log(
                JSON.stringify(
                    {
                        ok: true,
                        ...result,
                    },
                    null,
                    2
                )
            );
            process.exit(0);
        })
        .catch((error: unknown) => {
            console.error("Falha na sincronizacao ODBC-CRM:", error);
            process.exit(1);
        });
}

function runEveryFifteenDays() {
    const intervalMs = 15 * 24 * 60 * 60 * 1000;

    const tick = async () => {
        try {
            const result = await syncCompaniesFromOdbc();
            console.log(`Sincronizacao ODBC concluida em ${new Date().toISOString()}`);
            console.log(JSON.stringify(result, null, 2));
        } catch (error) {
            console.error("Erro durante sincronizacao programada:", error);
        }
    };

    void tick();
    setInterval(() => {
        void tick();
    }, intervalMs);
}

const isDirectExecution = (() => {
    if (!process.argv[1]) return false;
    try {
        return import.meta.url === pathToFileURL(process.argv[1]).href;
    } catch {
        return false;
    }
})();

if (isDirectExecution) {
    const mode = process.argv.includes("--watch") ? "watch" : "once";

    if (mode === "watch") {
        runEveryFifteenDays();
    } else {
        runOnce();
    }
}
