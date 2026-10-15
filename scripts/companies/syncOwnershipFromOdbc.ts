import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@prisma/client";
import { mergeOwnershipEvent, ownershipEventSchema } from "../../lib/ownership";
import prisma from "../../lib/prisma";

type OdbcPartner = {
  name: string; cpf: string | null; partnerCnpj: string | null; birthDate: string | null;
  percentageBps: number | null; ownershipValueCents: string | null; quotas: string | null;
  quotaValueCents: string | null;
};
type OdbcCompany = {
  cnpj: string; name: string | null; effectiveAt: string; capitalCents: string;
  completeOwnership: boolean; sourceCode: string; sourceFileId: string; sourceHash: string;
  partners: OdbcPartner[];
};
type Snapshot = { version: number; companies: OdbcCompany[]; stats: Record<string, number> };
type ExistingPartner = {
  id: number; name: string; cpf: string | null; partnerCnpj: string | null;
  isCorporate: boolean; birthDate: string | null; ownershipHistory: Prisma.JsonValue | null;
};
type Action = { companyCnpj: string; companyName: string | null; completeOwnership: boolean;
  effectiveAt: string; sourceFileId: string; capitalCents: string;
  partners: Array<{ source: OdbcPartner; existing: ExistingPartner | null; event: Record<string, unknown> | null }> };

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const normalizeName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
const normalizeCnpj = (value: string) => value.replace(/\D/g, "");
const checksum = (value: string, weights: number[]) => {
  const remainder = [...value].reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0) % 11;
  return remainder < 2 ? 0 : 11 - remainder;
};
function validCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^([0-9])\1+$/.test(value)) return false;
  const first = checksum(value.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checksum(value.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(value[9]) && second === Number(value[10]);
}
function validCnpj(value: string) {
  if (!/^\d{14}$/.test(value) || /^([0-9])\1+$/.test(value)) return false;
  const first = checksum(value.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checksum(value.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(value[12]) && second === Number(value[13]);
}

function readSnapshot(): Snapshot {
  const command = process.platform === "win32" ? "python" : "python3";
  const output = execFileSync(command, ["-m", "Banco.exportar_societario"], {
    cwd: root, encoding: "utf8", env: { ...process.env, PYTHONPATH: root },
    stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024,
  });
  const snapshot = JSON.parse(output) as Snapshot;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.companies)) throw new Error("Snapshot ODBC inválido");
  for (const company of snapshot.companies) {
    if (!/^\d{14}$/.test(company.cnpj) || !/^\d{4}-\d{2}-\d{2}$/.test(company.effectiveAt)
      || !/^\d+$/.test(company.capitalCents) || !/^[a-f0-9]{64}$/.test(company.sourceHash)) {
      throw new Error("Snapshot societário contém dados inválidos");
    }
    if (!company.partners.length) throw new Error("Snapshot sem sócios; importação interrompida");
    for (const partner of company.partners) {
      if (!partner.name.trim() || (partner.cpf && !validCpf(partner.cpf))
        || (partner.partnerCnpj && !validCnpj(partner.partnerCnpj))
        || (partner.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(partner.birthDate))) {
        throw new Error("Snapshot contém identificação ou data inválida");
      }
    }
    if (company.completeOwnership && company.partners.reduce((sum, partner) => sum + (partner.percentageBps ?? 0), 0) !== 10000) {
      throw new Error("Percentuais societários não totalizam 100%");
    }
  }
  return snapshot;
}

function planActions(snapshot: Snapshot, companies: Array<{ cnpj: string; name: string | null; deletedAt: Date | null;
  profitPartners: ExistingPartner[] }>) {
  const crmByCnpj = new Map(companies.map(company => [normalizeCnpj(company.cnpj), company]));
  const actions: Action[] = [];
  let unmatchedCompanies = 0;
  let archivedCompanies = 0;
  let incompletePercentages = 0;
  let ambiguousPartners = 0;
  let skippedOlderEvents = 0;
  let stalePartnerCreations = 0;
  let identityOnly = 0;
  let partnersToCreate = 0;
  let partnersToUpdate = 0;
  let historiesToUpdate = 0;
  let birthDatesToUpdate = 0;
  const skipDuplicates = (partners: OdbcPartner[]) => {
    const seen = new Set<string>();
    return partners.filter(partner => {
      const key = partner.cpf ? `cpf:${partner.cpf}` : partner.partnerCnpj ? `cnpj:${partner.partnerCnpj}` : `name:${normalizeName(partner.name)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  for (const sourceCompany of snapshot.companies) {
    const company = crmByCnpj.get(sourceCompany.cnpj);
    if (!company) { unmatchedCompanies++; continue; }
    if (company.deletedAt) { archivedCompanies++; continue; }
    if (!sourceCompany.completeOwnership) incompletePercentages++;
    const companyLatestOwnershipDate = company.profitPartners.flatMap(partner =>
      Array.isArray(partner.ownershipHistory) ? partner.ownershipHistory : [])
      .reduce<string | null>((latest, value) => {
        if (!value || typeof value !== "object" || !("effectiveAt" in value) || typeof value.effectiveAt !== "string") return latest;
        return !latest || value.effectiveAt > latest ? value.effectiveAt : latest;
      }, null);
    const sourceIsOlderThanCompany = !!companyLatestOwnershipDate && sourceCompany.effectiveAt < companyLatestOwnershipDate;
    const partners = skipDuplicates(sourceCompany.partners);
    const matched = partners.map(source => {
      const byId = company.profitPartners.filter(partner =>
        (source.cpf && partner.cpf === source.cpf) || (source.partnerCnpj && partner.partnerCnpj === source.partnerCnpj));
      if (byId.length > 1) throw new Error("CPF/CNPJ duplicado no CRM; revise antes de importar");
      let existing = byId[0] ?? null;
      if (!existing) {
        const byName = company.profitPartners.filter(partner => normalizeName(partner.name) === normalizeName(source.name)
          && (!partner.cpf || !source.cpf || partner.cpf === source.cpf)
          && (!partner.partnerCnpj || !source.partnerCnpj || partner.partnerCnpj === source.partnerCnpj));
        if (byName.length > 1) { ambiguousPartners++; return { source, existing: null, event: null, skip: true }; }
        existing = byName[0] ?? null;
        // Name can reconcile only a CRM row without a conflicting source identity.
        if (existing && ((source.cpf && existing.partnerCnpj) || (source.partnerCnpj && existing.cpf))) {
          ambiguousPartners++; return { source, existing: null, event: null, skip: true };
        }
      }
      const history = Array.isArray(existing?.ownershipHistory) ? existing.ownershipHistory : [];
      const latestDate = history.reduce<string | null>((latest, value) => {
        if (!value || typeof value !== "object" || !("effectiveAt" in value) || typeof value.effectiveAt !== "string") return latest;
        return !latest || value.effectiveAt > latest ? value.effectiveAt : latest;
      }, null);
      let event: Record<string, unknown> | null = null;
      if (sourceCompany.completeOwnership && source.percentageBps != null) {
        const sourceId = `${sourceCompany.sourceFileId}:${source.cpf ?? source.partnerCnpj ?? normalizeName(source.name)}`;
        const alreadyImported = history.find(value => value && typeof value === "object" && "sourceFileId" in value && value.sourceFileId === sourceId);
        if (alreadyImported) {
          const validation = ownershipEventSchema.safeParse(alreadyImported);
          if (!validation.success) throw new Error("Histórico ODBC previamente salvo é inválido");
          event = validation.data;
        } else if (!latestDate || sourceCompany.effectiveAt > latestDate) {
          event = ownershipEventSchema.parse({ effectiveAt: sourceCompany.effectiveAt, sequence: 0,
            percentageBps: source.percentageBps, capitalCents: sourceCompany.capitalCents,
            ownershipValueCents: source.ownershipValueCents ?? undefined,
            quotas: source.quotas ?? undefined, quotaValueCents: source.quotaValueCents ?? undefined,
            sourceFileId: sourceId, sourceHash: sourceCompany.sourceHash });
        } else if (sourceCompany.effectiveAt < latestDate) skippedOlderEvents++;
        // Same-date contracts retain their existing provenance and aren't silently replaced.
      } else identityOnly++;
      if (!existing && sourceIsOlderThanCompany) {
        stalePartnerCreations++;
        return { source, existing: null, event, skip: true };
      }
      if (!existing) partnersToCreate++;
      else {
        if (existing.name !== source.name || (source.cpf && existing.cpf !== source.cpf)
          || (source.partnerCnpj && existing.partnerCnpj !== source.partnerCnpj)
          || (source.birthDate && existing.birthDate !== source.birthDate)) partnersToUpdate++;
        if (source.birthDate && existing.birthDate !== source.birthDate) birthDatesToUpdate++;
      }
      if (event && !isDeepStrictEqual(event, Array.isArray(existing?.ownershipHistory)
        ? existing.ownershipHistory.find(value => value && typeof value === "object" && "sourceFileId" in value && value.sourceFileId === event?.sourceFileId)
        : undefined)) historiesToUpdate++;
      return { source, existing, event, skip: false };
    });
    actions.push({ companyCnpj: sourceCompany.cnpj, companyName: company.name,
      completeOwnership: sourceCompany.completeOwnership, effectiveAt: sourceCompany.effectiveAt,
      sourceFileId: sourceCompany.sourceFileId, capitalCents: sourceCompany.capitalCents,
      partners: matched.filter((item): item is typeof item & { skip: false } => !item.skip)
        .map(({ source, existing, event }) => ({ source, existing, event })) });
  }
  return { actions, stats: { sourceCompanies: snapshot.companies.length, matchedCompanies: actions.length,
    unmatchedCompanies, archivedCompanies, incompletePercentages, ambiguousPartners,
    partnersToCreate, partnersToUpdate, historiesToUpdate, birthDatesToUpdate,
    skippedOlderEvents, stalePartnerCreations, identityOnly } };
}

async function sync(apply: boolean) {
  const snapshot = readSnapshot();
  const companies = await prisma.company.findMany({
    select: { cnpj: true, name: true, deletedAt: true,
      profitPartners: { select: { id: true, name: true, cpf: true, partnerCnpj: true, isCorporate: true,
        birthDate: true, ownershipHistory: true } } },
  });
  const plan = planActions(snapshot, companies);
  if (!apply) return { mode: "preview", sourceStats: snapshot.stats, ...plan.stats };

  let created = 0; let updated = 0; let historyWrites = 0;
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const action of plan.actions) {
      for (const item of action.partners) {
        const { source, existing, event } = item;
        let ownershipHistory: Prisma.InputJsonValue | undefined;
        if (event) {
          const history = Array.isArray(existing?.ownershipHistory) ? existing.ownershipHistory : [];
          ownershipHistory = mergeOwnershipEvent(history, event as never) as Prisma.InputJsonValue;
        }
        const data = {
          name: source.name,
          ...(source.cpf ? { cpf: source.cpf } : {}),
          ...(source.partnerCnpj ? { partnerCnpj: source.partnerCnpj, isCorporate: true } : {}),
          ...(source.birthDate ? { birthDate: source.birthDate } : {}),
          ...(ownershipHistory ? { ownershipHistory } : {}),
        };
        if (existing) {
          const differs = existing.name !== data.name || (!!data.cpf && existing.cpf !== data.cpf)
            || (!!data.partnerCnpj && existing.partnerCnpj !== data.partnerCnpj)
            || (!!data.birthDate && existing.birthDate !== data.birthDate)
            || (!!ownershipHistory && !isDeepStrictEqual(ownershipHistory, existing.ownershipHistory));
          if (differs) {
            await tx.profitPartner.update({ where: { id: existing.id }, data });
            updated++;
            if (ownershipHistory && !isDeepStrictEqual(ownershipHistory, existing.ownershipHistory)) historyWrites++;
          }
        } else {
          await tx.profitPartner.create({ data: { ...data, companyCnpj: action.companyCnpj,
            isCorporate: !!source.partnerCnpj, cpf: source.cpf, partnerCnpj: source.partnerCnpj,
            birthDate: source.birthDate, ownershipHistory: ownershipHistory ?? undefined } });
          created++;
          if (ownershipHistory) historyWrites++;
        }
      }
    }
    if (updated || created) await tx.$queryRaw`SELECT pg_notify('ownership_updated', '')::text`;
  }, { maxWait: 10000, timeout: 120000 });

  const verifiedCompanies = await prisma.company.findMany({
    where: { cnpj: { in: plan.actions.map(action => action.companyCnpj) }, deletedAt: null },
    select: { cnpj: true, profitPartners: { select: { name: true, cpf: true, partnerCnpj: true, birthDate: true, ownershipHistory: true } } },
  });
  const persistedCount = verifiedCompanies.reduce((sum, company) => sum + company.profitPartners.length, 0);
  const expectedCount = plan.actions.reduce((sum, action) => sum + action.partners.length, 0);
  if (verifiedCompanies.length !== plan.actions.length || persistedCount < expectedCount) {
    throw new Error("Verificação pós-commit falhou; confira a persistência societária");
  }
  return { mode: "applied", sourceStats: snapshot.stats, ...plan.stats,
    created, updated, historyWrites, verifiedCompanies: verifiedCompanies.length, persistedPartnerRows: persistedCount };
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (direct) {
  sync(process.argv.includes("--apply"))
    .then(result => { console.log(JSON.stringify(result, null, 2)); process.exit(0); })
    .catch((error: unknown) => { console.error("Falha na sincronização societária ODBC:", error instanceof Error ? error.message : "erro desconhecido"); process.exit(1); });
}

export { planActions, readSnapshot };
