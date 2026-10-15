import "dotenv/config";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import prisma from "../../lib/prisma";
import { mergeOwnershipEvent } from "../../lib/ownership";
import {
  findPersistedOwnershipPartner,
  ownershipSyncSchema,
  persistenceIssues,
} from "../../lib/ownership-validation";

async function importNamesOnly(input: Extract<ReturnType<typeof ownershipSyncSchema.parse>, { mode: "names-only" }>) {
  const apply = process.argv.includes("--apply");
  const nameKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.companyCnpj}, 0))::text`;
    const company = await tx.company.findFirst({ where: { cnpj: input.companyCnpj, deletedAt: null } });
    if (!company) throw new Error("Empresa não encontrada");
    const existing = await tx.profitPartner.findMany({ where: { companyCnpj: input.companyCnpj } });
    let writes = 0;
    for (const partner of input.partners) {
      const matches = existing.filter(item => nameKey(item.name) === nameKey(partner.name)
        || (partner.partnerCnpj && item.partnerCnpj === partner.partnerCnpj));
      if (matches.length > 1) throw new Error("Sócio ambíguo no cadastro; revisão necessária");
      const match = matches[0];
      if (match?.cpf && (partner.isCorporate || partner.partnerCnpj)) {
        throw new Error("Sócio PJ conflita com CPF já cadastrado; revisão necessária");
      }
      if (match?.partnerCnpj && partner.partnerCnpj && match.partnerCnpj !== partner.partnerCnpj) {
        throw new Error("CNPJ conflitante para a sócia PJ; revisão necessária");
      }
      if (!apply) continue;
      if (match) {
        if ((partner.isCorporate || partner.partnerCnpj) && (!match.isCorporate || (!match.partnerCnpj && partner.partnerCnpj))) {
          await tx.profitPartner.update({ where: { id: match.id }, data: {
            isCorporate: true, partnerCnpj: partner.partnerCnpj ?? match.partnerCnpj,
          } });
          writes++;
        }
      } else {
        await tx.profitPartner.create({ data: {
          companyCnpj: input.companyCnpj, name: partner.name,
          partnerCnpj: partner.partnerCnpj ?? null, isCorporate: partner.isCorporate || !!partner.partnerCnpj,
        } });
        writes++;
      }
    }
    if (writes) await tx.$queryRaw`SELECT pg_notify('ownership_updated', '')::text`;
    return { writes };
  }, { maxWait: 10000, timeout: 30000 });
  if (!apply) {
    console.log(`Prévia de nomes: ${input.partners.length} sócio(s) conciliados.`);
    return;
  }
  const persisted = await prisma.profitPartner.findMany({
    where: { companyCnpj: input.companyCnpj }, select: { name: true, partnerCnpj: true, isCorporate: true,
      _count: { select: { distributions: true } } },
  });
  if (input.partners.some(partner => !persisted.some(item => (nameKey(item.name) === nameKey(partner.name)
      || !!partner.partnerCnpj && item.partnerCnpj === partner.partnerCnpj)
    && (!partner.isCorporate || item.isCorporate)
    && (!partner.partnerCnpj || item.partnerCnpj === partner.partnerCnpj)))) {
    throw new Error("Persistência pós-commit dos nomes não confere");
  }
  if (persisted.some(item => nameKey(item.name) === "SEM SOCIOS" && item._count.distributions > 0)) {
    const reason = "Cadastro provisório Sem sócios possui lançamentos financeiros; conciliar manualmente com os sócios identificados";
    const existingReview = await prisma.ownershipProcessingRun.findFirst({
      where: { companyCnpj: input.companyCnpj, status: "NEEDS_REVIEW",
        stage: "financial-reconciliation", errorMessage: reason }, select: { id: true },
    });
    if (!existingReview) await prisma.ownershipProcessingRun.create({ data: {
      correlationId: randomUUID(), companyCnpj: input.companyCnpj,
      status: "NEEDS_REVIEW", stage: "financial-reconciliation",
      errorCode: "PLACEHOLDER_DISTRIBUTIONS", errorMessage: reason, finishedAt: new Date(),
    } });
    console.warn(`REVIEW_FINANCIAL company=${input.companyCnpj}: ${reason}`);
  }
  console.log(`IMPORT_RESULT changed=${result.writes > 0} writes=${result.writes} namesOnly=true`);
  console.log(`PERSISTENCE_OK company=${input.companyCnpj} partners=${persisted.length}`);
}

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("Uso: tsx scripts/ownership/import.ts arquivo.json [--apply]");
  const json = path === "-"
    ? await new Promise<string>((resolve, reject) => {
      let value = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => { value += chunk; });
      process.stdin.on("end", () => resolve(value));
      process.stdin.on("error", reject);
    })
    : await (await import("node:fs/promises")).readFile(path, "utf8");
  const input = ownershipSyncSchema.parse(JSON.parse(json));
  for (const warning of input.warnings) console.warn(`Revisão do documento: ${warning}`);
  if (input.mode === "names-only") return importNamesOnly(input);
  const baseline = input.partners[0].ownershipHistory;
  const importResult = await prisma.$transaction(async tx => {
    // Serializes imports for this company across processes; released on commit/rollback.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.companyCnpj}, 0))::text`;
    let changed = false;
    let writeCount = 0;
    let unchangedCount = 0;
    const company = await tx.company.findFirst({ where: { cnpj: input.companyCnpj, deletedAt: null } });
    if (!company) throw new Error("Empresa não encontrada");
    const existingPartners = await tx.profitPartner.findMany({ where: { companyCnpj: input.companyCnpj } });
    const normalizeName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase().split(/\s+-\s+SOC\b/)[0].replace(/[^A-Z0-9]+/g, " ").trim();
    const nameTokens = (name: string) => new Set(normalizeName(name).split(" ").filter(Boolean));
    const namesMatch = (left: string, right: string) => {
      const leftTokens = nameTokens(left);
      const rightTokens = nameTokens(right);
      const smaller = leftTokens.size <= rightTokens.size ? leftTokens : rightTokens;
      const larger = leftTokens.size <= rightTokens.size ? rightTokens : leftTokens;
      return [...smaller].every(token => larger.has(token));
    };
    const matchedIds = new Set<number>();
    for (const partner of input.partners) {
      // CPF/CNPJ is authoritative. A duplicate name must never make an exact document
      // identity ambiguous. Name matching is used only for legacy rows missing identity.
      const identityMatches = existingPartners.filter(p =>
        (partner.cpf && p.cpf === partner.cpf)
        || (partner.partnerCnpj && p.partnerCnpj === partner.partnerCnpj));
      if (identityMatches.length > 1) {
        throw new Error("CPF/CNPJ duplicado no cadastro; revise antes de importar");
      }

      let match = identityMatches[0];
      if (!match) {
        const nameMatches = existingPartners.filter(p => {
          if (!namesMatch(p.name, partner.name)) return false;
          // If both sides already have different identities, these are different people
          // even when their names are identical.
          if (partner.cpf && p.cpf && p.cpf !== partner.cpf) return false;
          if (partner.partnerCnpj && p.partnerCnpj && p.partnerCnpj !== partner.partnerCnpj) return false;
          return true;
        });
        if (nameMatches.length > 1) {
          throw new Error("Vínculo ambíguo por nome e sem CPF/CNPJ único; revise o cadastro antes de importar");
        }
        match = nameMatches[0];
      }

      if (match) matchedIds.add(match.id);
      const ownershipHistory = input.mode === "latest-aditivo" || input.mode === "qsa-sole-owner"
        ? mergeOwnershipEvent(match?.ownershipHistory, partner.ownershipHistory[0]) : partner.ownershipHistory;
      if (!process.argv.includes("--apply")) continue;
      const data = { ...partner, ownershipHistory, birthDate: partner.birthDate ?? match?.birthDate ?? null,
        isCorporate: !!partner.partnerCnpj };
      const allowMissingIdentity = input.mode === "qsa-sole-owner" || input.mode === "name-based-history";
      if (match && persistenceIssues(data, match, allowMissingIdentity,
        input.mode === "name-based-history").length === 0
        && isDeepStrictEqual(ownershipHistory, match.ownershipHistory)) {
        unchangedCount++;
        continue;
      }
      const saved = match
        ? await tx.profitPartner.update({ where: { id: match.id }, data })
        : await tx.profitPartner.create({ data: { ...data, companyCnpj: input.companyCnpj } });
      const persisted = await tx.profitPartner.findUnique({ where: { id: saved.id } });
      if (persistenceIssues(data, persisted, allowMissingIdentity,
        input.mode === "name-based-history").length) throw new Error("Falha na verificação da persistência");
      writeCount++;
      changed = true;
    }
    if (input.mode === "latest-aditivo" || input.mode === "document-set") {
      // A complete snapshot proves that an existing partner absent from that snapshot
      // has 0% at that instant. When a document has no effective date, the extractor may
      // use Drive createdTime as the configured fallback and emits an audit warning.
      const snapshot = input.mode === "latest-aditivo" ? baseline[0] : baseline.at(-1)!;
      for (const partner of existingPartners.filter(p => !matchedIds.has(p.id) && p.ownershipHistory != null)) {
        const exitEvent = { ...snapshot, percentageBps: 0 };
        delete exitEvent.previousPercentageBps;
        const ownershipHistory = mergeOwnershipEvent(partner.ownershipHistory, exitEvent);
        if (process.argv.includes("--apply") && !isDeepStrictEqual(ownershipHistory, partner.ownershipHistory)) {
          await tx.profitPartner.update({ where: { id: partner.id }, data: { ownershipHistory } });
          writeCount++;
          changed = true;
        }
      }
    }
    // PostgreSQL delivers this only if the transaction commits. No personal data in the event.
    if (changed) await tx.$queryRaw`SELECT pg_notify('ownership_updated', '')::text`;
    return { changed, writeCount, unchangedCount };
  }, { maxWait: 10000, timeout: 30000 });

  if (!process.argv.includes("--apply")) {
    console.log("Validação concluída; use --apply para persistir.");
    return;
  }

  // Read again after COMMIT. This catches cases where the transaction appeared to
  // write successfully but the final persisted state does not contain the import.
  const persistedPartners = await prisma.profitPartner.findMany({
    where: { companyCnpj: input.companyCnpj },
    select: { id: true, name: true, cpf: true, partnerCnpj: true, birthDate: true, ownershipHistory: true },
  });
  const postCommitIssues: string[] = [];
  for (const partner of input.partners) {
    const stored = findPersistedOwnershipPartner(persistedPartners, {
      name: partner.name,
      cpf: partner.cpf,
      partnerCnpj: partner.partnerCnpj ?? null,
    });
    const issues = persistenceIssues(partner, stored,
      input.mode === "qsa-sole-owner" || input.mode === "name-based-history",
      input.mode === "name-based-history");
    if (issues.length) postCommitIssues.push(`${partner.name}: ${issues.join(", ")}`);
  }
  if (postCommitIssues.length) {
    throw new Error(`Persistência pós-commit não confere: ${postCommitIssues.join(" | ")}`);
  }

  console.log(`IMPORT_RESULT changed=${importResult.changed} writes=${importResult.writeCount} unchanged=${importResult.unchangedCount}`);
  console.log(`PERSISTENCE_OK company=${input.companyCnpj} partners=${input.partners.length}`);
  console.log(importResult.changed
    ? "Dados gravados e confirmados no banco."
    : "Nenhuma alteração necessária; os dados já estavam persistidos.");
}
main().catch(error => {
  console.error(error instanceof Error && !('code' in error)
    ? error.message : "Importação falhou; verifique o banco e as migrations."); process.exitCode = 1;
})
  .finally(() => prisma.$disconnect());
