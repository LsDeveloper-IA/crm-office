import { readFile } from "node:fs/promises";
import { ZodError } from "zod";
import prisma from "../../lib/prisma";
import { extractedPartnerSchema, ownershipImportSchema, persistenceIssues } from "../../lib/ownership-validation";

let stage = "argumentos";

async function verifyDatabase() {
  stage = "banco de dados";
  await prisma.$queryRaw`SELECT 1`;
  const partners = await prisma.profitPartner.findMany({
    where: { company: { deletedAt: null } },
    select: { id: true, companyCnpj: true, name: true, cpf: true, partnerCnpj: true,
      birthDate: true, ownershipHistory: true },
  });
  const counts: Record<string, number> = {};
  let valid = 0;
  let withHistory = 0;
  for (const partner of partners) {
    if (Array.isArray(partner.ownershipHistory) && partner.ownershipHistory.length) withHistory++;
    const parsed = extractedPartnerSchema.safeParse(partner);
    if (parsed.success) { valid++; continue; }
    const fields = new Set(parsed.error.issues.map(issue => issue.path.join(".") || "identidade"));
    // A null history can stop Zod refinements; report missing identity/birth independently.
    if (!partner.cpf && !partner.partnerCnpj) fields.add("identidade");
    if (!partner.partnerCnpj && !partner.birthDate) fields.add("birthDate");
    for (const field of fields) {
      counts[field] = (counts[field] ?? 0) + 1;
    }
  }
  console.log(JSON.stringify({ mode: "database", connection: "ok", checked: partners.length,
    valid, withHistory, incompleteOrInvalid: partners.length - valid, fields: counts,
    note: "Auditoria do cadastro. A comparação com o documento exige o JSON extraído." }, null, 2));
  if (valid !== partners.length) process.exitCode = 1;
}

async function main() {
  const path = process.argv.slice(2).filter(arg => arg !== "--")[0];
  if (!path || path === "--database") return verifyDatabase();
  stage = "leitura do arquivo";
  const raw = await readFile(path, "utf8");
  stage = "JSON";
  const json = JSON.parse(raw.replace(/^\uFEFF/, ""));
  stage = "campos obrigatórios";
  const input = ownershipImportSchema.parse(json);
  stage = "banco de dados";
  const company = await prisma.company.findFirst({
    where: { cnpj: input.companyCnpj, deletedAt: null },
    select: { profitPartners: true },
  });
  if (!company) throw new Error("Empresa não encontrada");
  const results = input.partners.map((partner, index) => {
    const stored = company.profitPartners.find(item => partner.cpf
      ? item.cpf === partner.cpf : item.partnerCnpj === partner.partnerCnpj);
    return { index, partnerId: stored?.id, issues: persistenceIssues(partner, stored) };
  });
  const ok = results.every(result => result.issues.length === 0);
  console.log(JSON.stringify({ ok, checked: results.length, results }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`Auditoria interrompida na etapa: ${stage}.`);
  if (error instanceof ZodError) {
    console.error(JSON.stringify(error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message })), null, 2));
  } else if (error instanceof SyntaxError) {
    console.error("O arquivo não contém JSON válido.");
  } else {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : null;
    console.error(code === "ENOENT"
      ? "Arquivo não encontrado. Informe um JSON real gerado pelo extrator; .local/extracted.json era apenas um exemplo. Execute sem argumento para auditar o banco."
      : code ? `Código: ${code}. Verifique a etapa indicada.` : stage === "banco de dados"
        ? "Não foi possível consultar a empresa. Verifique a configuração do banco e se a empresa existe."
        : "Não foi possível concluir esta etapa.");
  }
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
