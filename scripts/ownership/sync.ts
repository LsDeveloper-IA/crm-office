import "dotenv/config";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import prisma from "../../lib/prisma";
import { ownershipImportSchema, ownershipSyncSchema, qsaSoleOwnerImportSchema } from "../../lib/ownership-validation";
import { ownershipCasePolicy } from "../../lib/ownership-case-policy";
import {
  isAmbiguousExistingPartnerLinkError,
  isNoImportableOwnershipHistoryError,
  isNoOwnershipDocumentError,
} from "../../lib/ownership-sync-errors";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function pythonExecutable() {
  if (process.env.PYTHON_EXECUTABLE) return process.env.PYTHON_EXECUTABLE;
  const managed = process.platform === "win32"
    ? path.join(root, ".venv-ocr", "Scripts", "python.exe")
    : path.join(root, ".venv-ocr", "bin", "python");
  return existsSync(managed) ? managed : "python";
}

function run(
  program: string,
  args: string[],
  captureOutput = false,
  input?: string,
  echoCaptured = true,
  echoErrorOutput = true,
) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(program, args, { cwd: root,
      stdio: [input === undefined ? "inherit" : "pipe", captureOutput ? "pipe" : "inherit", "pipe"],
      shell: false, windowsHide: true });
    let output = "";
    let errorOutput = "";
    if (captureOutput) child.stdout?.on("data", chunk => {
      const value = chunk.toString();
      output += value;
      if (echoCaptured) process.stdout.write(value);
    });
    child.stderr?.on("data", chunk => {
      const value = chunk.toString();
      errorOutput += value;
      if (echoErrorOutput) process.stderr.write(value);
    });
    if (input !== undefined) child.stdin?.end(input);
    child.on("error", () => reject(new Error(`Não foi possível executar ${program}`)));
    child.on("exit", code => code === 0 ? resolve(output) : reject(new Error(
      `Sync interrupted (code ${code}). No success was confirmed.${errorOutput ? ` ${errorOutput.trim()}` : ""}`,
    )));
  });
}

function normalizeName(value: string) {
  let normalized = value.trim().replace(/^\d{2}\.\d{3}\.\d{3}\s+/, "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ").trim();
  // Remove sufixos juridicos repetidos para aproximar nome empresarial e pasta.
  normalized = normalized.replace(/\s+(?:LTDA|ME|EPP|MEI|EIRELI|SPE|SS|SA|S A)$/g, "").trim();
  normalized = normalized.replace(/\s+(?:LTDA|ME|EPP|MEI|EIRELI|SPE|SS|SA|S A)$/g, "").trim();
  return normalized
    .split(" ").map(token => token === "JR" ? "JUNIOR" : token).join(" ");
}

function expandedPersonNameMatches(companyName: string, folderName: string) {
  const company = normalizeName(companyName).split(" ");
  const folder = normalizeName(folderName).split(" ");
  return company.length >= 4 && folder.length >= company.length
    && company.slice(0, -1).every((token, index) => token === folder[index])
    && company.at(-1)!.length >= 4 && folder[company.length - 1].startsWith(company.at(-1)!);
}

function nameScore(left: string, right: string) {
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);
  if (normalizedLeft === normalizedRight) return 1;
  const a = normalizedLeft.split(" ");
  const b = normalizedRight.split(" ");
  // Similarity cannot override a different leading business/person identifier.
  // This prevents matches such as LRW -> BRJ or F F -> F S in a shared Drive root.
  if (a.length >= 2 && b.length >= 2 && (a[0] !== b[0] || a[1] !== b[1])) return 0;
  const shorter = a.length <= b.length ? a : b;
  const longerName = a.length <= b.length ? normalizedRight : normalizedLeft;
  const shorterName = shorter.join(" ");
  // Pastas frequentemente usam apenas o nome fantasia/início da razão social,
  // como "4R CONECT" para "4R CONECT - SOLUCOES ... LTDA". Exigimos ao
  // menos dois tokens e correspondência como prefixo completo para não aceitar
  // pastas genéricas por uma única palavra.
  if (shorter.length >= 2 && longerName.startsWith(`${shorterName} `)) return 0.95;
  const shared = a.filter(token => b.includes(token)).length;
  return shared / Math.max(a.length, b.length);
}

function normalizePartnerName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .split(/\s+-\s+SOC\b/)[0].replace(/[^A-Z0-9]+/g, " ").trim();
}

function partnerNamesMatch(left: string, right: string) {
  const a = new Set(normalizePartnerName(left).split(" ").filter(Boolean));
  const b = new Set(normalizePartnerName(right).split(" ").filter(Boolean));
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  return [...smaller].every(token => larger.has(token));
}

type OwnershipCompany = {
  cnpj: string;
  name: string | null;
  profitPartners: Array<{
    name: string; cpf: string | null; partnerCnpj: string | null; birthDate: string | null; ownershipHistory: unknown;
  }>;
  qsas: Array<{ nome: string }>;
};

function ownershipComplete(company: OwnershipCompany) {
  const partnersWithHistory = company.profitPartners.filter(partner =>
    Array.isArray(partner.ownershipHistory) && partner.ownershipHistory.length > 0);
  if (!partnersWithHistory.length) return false;
  const payload = {
    mode: "document-set", companyCnpj: company.cnpj, partners: partnersWithHistory, warnings: [],
  };
  const persistedSnapshot = ownershipImportSchema.safeParse(payload);
  const qsaSingleOwner = partnersWithHistory.length === 1
    && qsaSoleOwnerImportSchema.safeParse({ ...payload, mode: "qsa-sole-owner" }).success;
  if (!persistedSnapshot.success && !qsaSingleOwner) return false;
  if (!company.qsas.length) return true;
  return company.qsas.every(qsa => partnersWithHistory.some(partner => partnerNamesMatch(partner.name, qsa.nome)));
}

function unchangedImport(audit: unknown) {
  return !!audit && typeof audit === "object" && !Array.isArray(audit)
    && "importChanged" in audit && audit.importChanged === false;
}

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function recordManualReview(cnpj: string, reason: string) {
  const existing = await prisma.ownershipProcessingRun.findFirst({
    where: { companyCnpj: cnpj, status: "NEEDS_REVIEW", stage: "manual-policy", errorMessage: reason },
    select: { id: true },
  });
  if (!existing) await prisma.ownershipProcessingRun.create({
    data: { correlationId: randomUUID(), companyCnpj: cnpj, status: "NEEDS_REVIEW",
      stage: "manual-policy", errorCode: "MANUAL_REVIEW", errorMessage: reason, finishedAt: new Date() },
  });
}

type OwnershipBatchIssue = {
  cnpj: string;
  name: string;
  status: string;
  reason: string;
};

async function writeBatchReport(report: {
  generatedAt: string;
  selected: number;
  succeeded: number;
  skippedComplete: number;
  processed: number;
  notCompleted: OwnershipBatchIssue[];
}) {
  const reportPath = path.resolve(root, argValue("--report-json") ?? ".local/ownership-case-aside-report.json");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`JSON_REPORT ${reportPath}`);

  // Relatorio de qualidade em Markdown para revisao manual e conferencia dos motivos.
  const byStatus = new Map<string, typeof report.notCompleted>();
  for (const item of report.notCompleted) {
    const group = byStatus.get(item.status) ?? [];
    group.push(item);
    byStatus.set(item.status, group);
  }
  const markdownLines = [
    "# Relatorio de qualidade da sincronizacao societaria",
    "",
    `- Gerado em: ${report.generatedAt}`,
    `- Selecionadas: ${report.selected}`,
    `- Sucesso: ${report.succeeded}`,
    `- Ja completas: ${report.skippedComplete}`,
    `- Processadas neste lote: ${report.processed}`,
    `- Nao concluidas: ${report.notCompleted.length}`,
    "",
    "## Motivos e quantidade",
    "",
  ];
  for (const [status, items] of [...byStatus.entries()].sort((a, b) => b[1].length - a[1].length)) {
    markdownLines.push(`### ${status} - ${items.length}`);
    markdownLines.push("");
    for (const item of items.slice(0, 10)) {
      markdownLines.push(`- ${item.cnpj} - ${item.name}`);
    }
    if (items.length > 10) markdownLines.push(`- ... mais ${items.length - 10} empresa(s)`);
    markdownLines.push("");
  }
  const markdownPath = reportPath.replace(/\.json$/i, ".md");
  await writeFile(markdownPath, `${markdownLines.join("\n")}\n`, "utf8");
  console.log(`QUALITY_REPORT ${markdownPath}`);
}

async function main() {
  const all = process.argv.includes("--all");
  if (all) return syncAll();
  const cnpj = (process.argv[2] ?? "").replace(/\D/g, "");
  if (!/^\d{14}$/.test(cnpj)) throw new Error("Uso: npm run ownership:sync -- CNPJ [--preview] [--force]");
  const company = await prisma.company.findFirst({
    where: { cnpj, deletedAt: null },
    select: {
      cnpj: true, name: true,
      profitPartners: { select: { name: true, cpf: true, partnerCnpj: true, birthDate: true, ownershipHistory: true } },
      qsas: { where: { deletedAt: null }, select: { nome: true } },
    },
  });
  if (!company) throw new Error("Empresa não encontrada entre os cadastros ativos deste banco.");
  const policy = ownershipCasePolicy(company.name);
  if (policy.action === "skip") {
    console.log(`SKIP_INSTRUCTED ${company.cnpj} ${company.name}: ${policy.reason}`);
    return;
  }
  if (policy.action === "review") {
    await recordManualReview(company.cnpj, policy.reason);
    console.log(`NEEDS_REVIEW ${company.cnpj} ${company.name}: ${policy.reason}`);
    return;
  }
  const lastPersisted = await prisma.ownershipProcessingRun.findFirst({
    where: { companyCnpj: cnpj, status: "PERSISTED" },
    orderBy: { startedAt: "desc" }, select: { audit: true },
  });
  if (!process.argv.includes("--force") && (ownershipComplete(company) || unchangedImport(lastPersisted?.audit))) {
    console.log(`Empresa já processada: ${company.cnpj} ${company.name ?? ""}. Use --force para reprocessar.`);
    return;
  }
  const resolvedFolderId = argValue("--resolved-folder-id");
  const driveFolderId = resolvedFolderId ?? process.env.GOOGLE_DRIVE_COMPANY_FOLDER_ID;
  if (!driveFolderId) throw new Error("Configure GOOGLE_DRIVE_COMPANY_FOLDER_ID no .env.");
  if (!company.name?.trim()) throw new Error("A empresa não possui nome cadastrado no banco para localizar a pasta do Drive.");
  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credentials) {
    await access(path.resolve(root, credentials)).catch(() => {
      throw new Error("O arquivo GOOGLE_APPLICATION_CREDENTIALS configurado no .env não existe.");
    });
  }
  const correlationId = randomUUID();
  process.env.OWNERSHIP_CORRELATION_ID = correlationId;
  // Context is inherited only by the extraction worker. It helps reconcile extracted names
  // and identities without writing customer data to an intermediate context file.
  process.env.OWNERSHIP_DB_CONTEXT = JSON.stringify({
    company: { cnpj: company.cnpj, name: company.name },
    partners: company.profitPartners.map(partner => ({
      name: partner.name,
      cpf: partner.cpf,
      partnerCnpj: partner.partnerCnpj,
      birthDate: partner.birthDate,
    })),
    qsaNames: company.qsas.map(qsa => qsa.nome),
    requireCorporatePartner: policy.action === "corporate-partner",
  });
  await prisma.ownershipProcessingRun.create({
    data: { correlationId, companyCnpj: cnpj, status: "RECEIVED", stage: "drive" },
  });
  try {
    console.log(`PROCESSING_RUN correlationId=${correlationId} company=${cnpj}`);
    await prisma.ownershipProcessingRun.update({
      where: { correlationId }, data: { status: "EXTRACTING", stage: "drive-gemini-parse" },
    });
    const extractedOutput = await run(pythonExecutable(), ["scripts/ownership/extract.py",
      "--folder-id", driveFolderId,
      ...(resolvedFolderId ? ["--folder-already-resolved"] : []),
      "--company-cnpj", cnpj, "--company-name", company.name.trim(), "--output", "-"], true, undefined, false);
    const extracted = ownershipSyncSchema.parse(JSON.parse(extractedOutput));
    const audit = {
      warnings: extracted.warnings,
      documents: extracted.documents.map(document => ({
        sourceFileId: document.sourceFileId,
        filename: document.filename,
        status: document.status,
        issues: document.issues,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        sha256: document.sha256,
        pageMetrics: document.pageMetrics,
        pageIssues: document.pageIssues,
        classification: document.classification,
      })),
    };
    await prisma.ownershipProcessingRun.update({
      where: { correlationId }, data: { status: "VALIDATING", stage: "schema", audit },
    });
    if (!process.argv.includes("--preview")) {
      await prisma.ownershipProcessingRun.update({
        where: { correlationId }, data: { status: "PERSISTING", stage: "database" },
      });
    }
    const importOutput = await run(process.execPath, ["--import", "tsx", "scripts/ownership/import.ts", "-",
      ...(process.argv.includes("--preview") ? [] : ["--apply"])], true,
    JSON.stringify(extracted), true);
    const importChanged = /IMPORT_RESULT changed=(true|false)/.exec(importOutput)?.[1];
    await prisma.ownershipProcessingRun.update({
      where: { correlationId },
      data: {
        status: process.argv.includes("--preview") ? "VALIDATED" : "PERSISTED",
        stage: process.argv.includes("--preview") ? "preview-complete" : "complete",
        audit: { ...audit, ...(importChanged == null ? {} : { importChanged: importChanged === "true" }) },
        finishedAt: new Date(),
      },
    });
    if (!process.argv.includes("--preview")) {
      await prisma.ownershipProcessingRun.updateMany({
        where: { companyCnpj: cnpj, status: "NEEDS_REVIEW", stage: "manual-policy" },
        data: { status: "PERSISTED", stage: "manual-resolved", finishedAt: new Date() },
      });
    }
    console.log(process.argv.includes("--preview")
      ? "Prévia validada, sem alterar o banco."
      : "Sincronização concluída. A persistência foi relida após o commit; confira IMPORT_RESULT/PERSISTENCE_OK acima.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida";
    await prisma.ownershipProcessingRun.update({
      where: { correlationId },
      data: {
        status: /timeout|tempor|ECONN|ConnectError|NetworkError|TransportError|HTTP 429|HTTP 5\d\d|\b(?:408|429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|quota|DAILY_QUOTA/i.test(message)
          ? "FAILED_RETRYABLE" : "NEEDS_REVIEW",
        stage: "failed",
        errorCode: error instanceof Error ? error.name.slice(0, 80) : "UNKNOWN",
        errorMessage: message,
        finishedAt: new Date(),
      },
    }).catch(updateError => console.error("Não foi possível registrar a falha da execução", updateError));
    throw error;
  } finally {
    delete process.env.OWNERSHIP_DB_CONTEXT;
  }
}

async function syncAll() {
  if (!process.env.GOOGLE_DRIVE_COMPANY_FOLDER_ID) throw new Error("Configure GOOGLE_DRIVE_COMPANY_FOLDER_ID no .env.");
  const companies = await prisma.company.findMany({
    // O processamento em lote do ownership é restrito às empresas sinalizadas
    // para análise manual; a marcação em qualquer ano inclui a empresa.
    where: { deletedAt: null, profitSettings: { some: { caseAside: true } } },
    select: {
      cnpj: true, name: true,
      profitPartners: { select: { name: true, cpf: true, partnerCnpj: true, birthDate: true, ownershipHistory: true } },
      qsas: { where: { deletedAt: null }, select: { nome: true } },
    },
    orderBy: { name: "asc" },
  });
  const force = process.argv.includes("--force");
  const persistedRuns = await prisma.ownershipProcessingRun.findMany({
    where: { status: "PERSISTED" }, orderBy: { startedAt: "desc" },
    select: { companyCnpj: true, audit: true },
  });
  const lastPersistedByCompany = new Map<string, unknown>();
  for (const run of persistedRuns) if (!lastPersistedByCompany.has(run.companyCnpj)) {
    lastPersistedByCompany.set(run.companyCnpj, run.audit);
  }
  const skippedInstructed = companies.filter(company => ownershipCasePolicy(company.name).action === "skip");
  const reviewPending = companies.filter(company => ownershipCasePolicy(company.name).action === "review");
  const eligible = companies.filter(company => !["skip", "review"].includes(ownershipCasePolicy(company.name).action));
  const alreadyHandled = (company: OwnershipCompany) => ownershipComplete(company)
    || unchangedImport(lastPersistedByCompany.get(company.cnpj));
  const skippedComplete = force ? [] : eligible.filter(alreadyHandled);
  const pendingCompanies = force ? eligible : eligible.filter(company => !alreadyHandled(company));
  const notCompleted: OwnershipBatchIssue[] = [
    ...skippedInstructed.map(company => ({
      cnpj: company.cnpj,
      name: company.name ?? "",
      status: "SKIP_INSTRUCTED",
      reason: ownershipCasePolicy(company.name).reason,
    })),
    ...reviewPending.map(company => ({
      cnpj: company.cnpj,
      name: company.name ?? "",
      status: "NEEDS_REVIEW_POLICY",
      reason: ownershipCasePolicy(company.name).reason,
    })),
  ];
  console.log(
    `CASE_ASIDE_SCAN selected=${companies.length} pending=${pendingCompanies.length} `
    + `skippedComplete=${skippedComplete.length} skippedInstructed=${skippedInstructed.length} `
    + `reviewPending=${reviewPending.length}`,
  );
  for (const company of skippedComplete) {
    const reason = ownershipComplete(company)
      ? "histórico societário já está completo"
      : "última importação não alterou os dados";
    console.log(`SKIP_COMPLETE ${company.cnpj} ${company.name ?? ""}: ${reason}; use --force para reprocessar.`);
  }
  for (const company of skippedInstructed) {
    console.log(
      `SKIP_INSTRUCTED ${company.cnpj} ${company.name ?? ""}: `
      + ownershipCasePolicy(company.name).reason,
    );
  }
  for (const company of reviewPending) {
    console.log(
      `NEEDS_REVIEW_POLICY ${company.cnpj} ${company.name ?? ""}: `
      + ownershipCasePolicy(company.name).reason,
    );
  }
  if (process.argv.includes("--list-pending")) {
    for (const company of pendingCompanies) console.log(`PENDING ${company.cnpj} ${company.name ?? ""}`);
    console.log(
      `PENDING_SUMMARY pending=${pendingCompanies.length} skippedComplete=${skippedComplete.length} `
      + `skippedInstructed=${skippedInstructed.length} reviewPending=${reviewPending.length} `
      + `total=${companies.length}`,
    );
    return;
  }
  for (const company of reviewPending) await recordManualReview(company.cnpj, ownershipCasePolicy(company.name).reason);
  if (!pendingCompanies.length) {
    console.log(
      `\nIMPORT_SUMMARY success=0 failed=0 matched=0 missing=0 ambiguous=0 `
      + `skippedComplete=${skippedComplete.length} skippedInstructed=${skippedInstructed.length} `
      + `reviewPending=${reviewPending.length} total=${companies.length}`,
    );
    await writeBatchReport({
      generatedAt: new Date().toISOString(),
      selected: companies.length,
      succeeded: 0,
      skippedComplete: skippedComplete.length,
      processed: 0,
      notCompleted,
    });
    return;
  }
  const preview = process.argv.includes("--preview");
  {
    console.log("DRIVE_FOLDER_SCAN starting: listando pastas da raiz do Drive.");
    const foldersOutput = await run(pythonExecutable(), ["scripts/ownership/extract.py", "--list-folders",
      "--folder-id", process.env.GOOGLE_DRIVE_COMPANY_FOLDER_ID, "--output", "-"], true, undefined, false);
    const folders = JSON.parse(foldersOutput) as { id: string; name: string }[];
    console.log(`DRIVE_FOLDER_SCAN completed: ${folders.length} pastas.`);
    const byName = new Map<string, { id: string; name: string }[]>();
    for (const folder of folders) {
      const key = normalizeName(folder.name);
      byName.set(key, [...(byName.get(key) ?? []), folder]);
    }
    const matched: { cnpj: string; name: string; folder: { id: string; name: string }; kind: string }[] = [];
    const missing: { cnpj: string; name: string; reason: string }[] = [];
    const ambiguous: { cnpj: string; name: string; reason: string }[] = [];
    for (const company of pendingCompanies) {
      const companyName = company.name?.trim();
      if (!companyName) {
        missing.push({ cnpj: company.cnpj, name: "", reason: "empresa sem nome cadastrado" });
        continue;
      }
      const exact = byName.get(normalizeName(companyName)) ?? [];
      if (exact.length === 1) {
        matched.push({ cnpj: company.cnpj, name: companyName, folder: exact[0], kind: "exata" });
        continue;
      }
      if (exact.length > 1) {
        ambiguous.push({
          cnpj: company.cnpj, name: companyName,
          reason: `mais de uma pasta com o mesmo nome: ${exact.map(folder => folder.name).join(" | ")}`,
        });
        continue;
      }
      const expanded = folders.filter(folder => expandedPersonNameMatches(companyName, folder.name));
      if (expanded.length === 1) {
        matched.push({ cnpj: company.cnpj, name: companyName, folder: expanded[0], kind: "nome-completo" });
        continue;
      }
      if (expanded.length > 1) {
        ambiguous.push({
          cnpj: company.cnpj, name: companyName,
          reason: `mais de uma pasta corresponde ao nome completo: ${expanded.map(folder => folder.name).join(" | ")}`,
        });
        continue;
      }
      const normalizedCompany = normalizeName(companyName);
      const prefixes = folders.filter(folder => {
        const normalizedFolder = normalizeName(folder.name);
        return normalizedFolder.split(" ").length >= 2
          && normalizedCompany.startsWith(`${normalizedFolder} `);
      }).sort((left, right) =>
        normalizeName(right.name).split(" ").length
        - normalizeName(left.name).split(" ").length
      );
      if (prefixes[0] && (!prefixes[1]
          || normalizeName(prefixes[0].name).split(" ").length
             > normalizeName(prefixes[1].name).split(" ").length)) {
        matched.push({ cnpj: company.cnpj, name: companyName, folder: prefixes[0], kind: "prefixo-especifico" });
        continue;
      }
      if (prefixes[0] && prefixes[1]
          && normalizeName(prefixes[0].name).split(" ").length
             === normalizeName(prefixes[1].name).split(" ").length) {
        ambiguous.push({
          cnpj: company.cnpj, name: companyName,
          reason: `prefixos igualmente específicos: ${prefixes
            .filter(folder => normalizeName(folder.name).split(" ").length
              === normalizeName(prefixes[0].name).split(" ").length)
            .map(folder => folder.name).join(" | ")}`,
        });
        continue;
      }
      const acronym = normalizeName(companyName).split(" ").map(token => token[0] ?? "").join("");
      const acronymFolders = acronym.length >= 3
        ? folders.filter(folder => normalizeName(folder.name).replace(/\s+/g, "") === acronym)
        : [];
      if (acronymFolders.length === 1) {
        matched.push({ cnpj: company.cnpj, name: companyName, folder: acronymFolders[0], kind: "sigla" });
        continue;
      }
      if (acronymFolders.length > 1) {
        ambiguous.push({
          cnpj: company.cnpj,
          name: companyName,
          reason: `varias pastas com a mesma sigla: ${acronymFolders.map(folder => folder.name).join(" | ")}`,
        });
        continue;
      }

      const tokenPrefixFolders = folders.filter(folder =>
        normalizeName(folder.name).split(" ").length >= 2 &&
        normalizeName(companyName).split(" ").length > normalizeName(folder.name).split(" ").length &&
        normalizeName(folder.name).split(" ").every((token, index) =>
          token === normalizeName(companyName).split(" ")[index]
        )
      );
      if (tokenPrefixFolders.length === 1) {
        matched.push({ cnpj: company.cnpj, name: companyName, folder: tokenPrefixFolders[0], kind: "prefixo-token" });
        continue;
      }
      if (tokenPrefixFolders.length > 1) {
        const longestLength = Math.max(...tokenPrefixFolders.map(folder => normalizeName(folder.name).split(" ").length));
        const longest = tokenPrefixFolders.filter(folder => normalizeName(folder.name).split(" ").length === longestLength);
        if (longest.length === 1) {
          matched.push({ cnpj: company.cnpj, name: companyName, folder: longest[0], kind: "prefixo-token" });
          continue;
        }
      }

      const ranked = folders.map(folder => {
        const score = nameScore(companyName, folder.name);
        const companyTokens = normalizeName(companyName).split(" ");
        const folderTokens = normalizeName(folder.name).split(" ");
        const commonTokens = companyTokens.filter(token => folderTokens.includes(token)).length;
        return { folder, score, commonTokens };
      }).sort((left, right) =>
        right.score - left.score ||
        right.commonTokens - left.commonTokens ||
        left.folder.name.localeCompare(right.folder.name));
      if (ranked[0] && ranked[0].score >= 0.8 && ranked[0].score - (ranked[1]?.score ?? 0) >= 0.15) {
        matched.push({ cnpj: company.cnpj, name: companyName, folder: ranked[0].folder, kind: "similaridade" });
      } else {
        const candidates = ranked.slice(0, 3)
          .map(({ folder, score }) => `${folder.name} (${Math.round(score * 100)}%)`).join(" | ");
        missing.push({
          cnpj: company.cnpj,
          name: companyName,
          reason: candidates
            ? `nenhuma pasta atingiu confiança suficiente; candidatos: ${candidates}`
            : "nenhuma pasta encontrada na raiz do Drive",
        });
      }
    }
    if (process.argv.includes("--list-matched")) {
      for (const item of matched) {
        console.log(`MATCHED ${item.cnpj} ${item.name} -> ${item.folder.name}`);
      }
      console.log(
        `MATCHED_SUMMARY matched=${matched.length} missing=${missing.length} `
        + `ambiguous=${ambiguous.length}`,
      );
      for (const item of missing) {
        console.log(`MISSING ${item.cnpj} ${item.name}: ${item.reason}`);
      }
      for (const item of ambiguous) {
        console.log(`AMBIGUOUS ${item.cnpj} ${item.name}: ${item.reason}`);
      }
      return;
    }
    notCompleted.push(
      ...missing.map(item => ({
        ...item,
        status: "DRIVE_FOLDER_NOT_FOUND",
      })),
      ...ambiguous.map(item => ({
        ...item,
        status: "DRIVE_FOLDER_AMBIGUOUS",
      })),
    );
    let success = 0;
    const failures: { cnpj: string; name: string; reason: string }[] = [];
    let skippedAmbiguousPartnerLink = 0;
    let skippedNoOwnershipDocument = 0;
    let skippedNoImportableHistory = 0;
    const startAfter = argValue("--start-after");
    const companyOrder = new Map(companies.map((company, index) => [company.cnpj, index]));
    const startPosition = startAfter ? companyOrder.get(startAfter) : undefined;
    if (startAfter && startPosition === undefined) throw new Error("CNPJ de --start-after não pertence à lista de empresas.");
    const remaining = startPosition === undefined ? matched
      : matched.filter(item => (companyOrder.get(item.cnpj) ?? -1) > startPosition);
    for (const item of remaining) {
      process.stdout.write(`\n=== ${item.kind}: ${item.name} -> ${item.folder.name} ===\n`);
      try {
        await run(process.execPath, ["--import", "tsx", "scripts/ownership/sync.ts", item.cnpj,
          "--resolved-folder-id", item.folder.id,
          ...(preview ? ["--preview"] : []), ...(force ? ["--force"] : [])],
        false, undefined, true, false);
        success++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isNoOwnershipDocumentError(message)) {
          skippedNoOwnershipDocument++;
          notCompleted.push({
            cnpj: item.cnpj, name: item.name,
            status: "SKIP_NO_OWNERSHIP_DOCUMENT", reason: message,
          });
          console.log(`SKIP_NO_OWNERSHIP_DOCUMENT ${item.cnpj} ${item.name}: ${message}`);
          continue;
        }
        if (isNoImportableOwnershipHistoryError(message)) {
          skippedNoImportableHistory++;
          notCompleted.push({
            cnpj: item.cnpj, name: item.name,
            status: "SKIP_NO_IMPORTABLE_OWNERSHIP_HISTORY", reason: message,
          });
          console.log(`SKIP_NO_IMPORTABLE_OWNERSHIP_HISTORY ${item.cnpj} ${item.name}: ${message}`);
          continue;
        }
        if (isAmbiguousExistingPartnerLinkError(message)) {
          skippedAmbiguousPartnerLink++;
          notCompleted.push({
            cnpj: item.cnpj, name: item.name,
            status: "NEEDS_REVIEW_AMBIGUOUS_PARTNER_LINK", reason: message,
          });
          console.log(`NEEDS_REVIEW_AMBIGUOUS_PARTNER_LINK ${item.cnpj} ${item.name}: ${message}`);
          continue;
        }
        failures.push({ cnpj: item.cnpj, name: item.name, reason: message });
        notCompleted.push({
          cnpj: item.cnpj, name: item.name,
          status: "FAILED", reason: message,
        });
        if (process.argv.includes("--stop-on-failure")) break;
      }
    }
    if (startAfter && startPosition !== undefined) {
      const notAttempted = matched.filter(item =>
        (companyOrder.get(item.cnpj) ?? -1) <= startPosition);
      notCompleted.push(...notAttempted.map(item => ({
        cnpj: item.cnpj,
        name: item.name,
        status: "NOT_ATTEMPTED_START_AFTER",
        reason: `lote retomado após ${startAfter}`,
      })));
    }
    console.log(`\nIMPORT_SUMMARY success=${success} failed=${failures.length} matched=${matched.length} missing=${missing.length} ambiguous=${ambiguous.length} skippedComplete=${skippedComplete.length} skippedInstructed=${skippedInstructed.length} skippedNoOwnershipDocument=${skippedNoOwnershipDocument} skippedNoImportableHistory=${skippedNoImportableHistory} skippedAmbiguousPartnerLink=${skippedAmbiguousPartnerLink} reviewPending=${reviewPending.length} total=${companies.length}`);
    for (const item of failures) {
      console.error(`FAILED ${item.cnpj} ${item.name}: ${item.reason}`);
    }
    for (const item of missing) {
      console.log(`MISSING ${item.cnpj} ${item.name}: ${item.reason}`);
    }
    for (const item of ambiguous) {
      console.log(`AMBIGUOUS ${item.cnpj} ${item.name}: ${item.reason}`);
    }
    await writeBatchReport({
      generatedAt: new Date().toISOString(),
      selected: companies.length,
      succeeded: success,
      skippedComplete: skippedComplete.length,
      processed: remaining.length,
      notCompleted,
    });
    if (failures.length) process.exitCode = 1;
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && "code" in error ? ` [${String(error.code)}]` : "";
  console.error(`${message}${code}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
