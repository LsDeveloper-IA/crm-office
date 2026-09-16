import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { createGmailClient, getTextBody, header, listAlterationMessages } from './gmail.mjs';
import { parseTextAlteration } from './parse-text.mjs';
import { MockCRM } from './crm.mjs';
import { PrismaCRM } from './prisma-crm.mjs';

let prisma;

function parseArgs(args) {
  const options = {
    apply: false,
    watch: false,
    everyDays: 7,
  };

  for (const arg of args) {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--watch') options.watch = true;
    else if (arg.startsWith('--every-days=')) {
      const value = Number(arg.split('=')[1]);
      if (!Number.isFinite(value) || value <= 0) throw new Error('O valor de --every-days deve ser um número inteiro maior que zero.');
      options.everyDays = Math.floor(value);
    } else {
      throw new Error(`Argumento inválido: ${arg}. Uso: node scripts/gmail/sync.mjs [--apply] [--watch] [--every-days=7]`);
    }
  }

  return options;
}

async function runSyncCycle(apply = false) {
  if (apply) {
    const { PrismaClient } = await import('@prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  const get = await createGmailClient();
  const profile = await get('profile');
  const ids = await listAlterationMessages(get);
  const alterations = [];
  const review = [];
  let ignored = 0, read = 0;

  for (const id of ids) {
    try {
      const message = await get(`messages/${encodeURIComponent(id)}`, { format: 'full' });
      const text = await getTextBody(get, message);
      if (!/\b(?:QSA|QUADRO\s+SOCIET[ÁA]RIO)\b/i.test(text)) { ignored++; continue; }
      alterations.push(parseTextAlteration(text, {
        messageId: message.id,
        dateHeader: header(message, 'Date'),
      }));
    } catch (error) { review.push({ messageId: id, reason: error.message }); }
    finally { read++; if (read % 25 === 0) console.log(`Leitura: ${read}/${ids.length}; QSA reconhecidos: ${alterations.length}.`); }
  }

  const crm = apply ? new PrismaCRM(prisma) : new MockCRM();
  let applied = 0, duplicates = 0;
  const companies = new Map();
  const blocked = new Set();

  for (const alteration of alterations.sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.messageId.localeCompare(b.messageId))) {
    if (blocked.has(alteration.cnpj)) {
      review.push({ messageId: alteration.messageId, reason: 'Empresa bloqueada por falha anterior nesta execução; reprocessar após revisão.' });
      continue;
    }
    try {
      const result = await crm.updateCompanyInCRM(profile.emailAddress, alteration, 2026);
      if (result.duplicate) { duplicates++; continue; }
      applied++;
      companies.set(alteration.cnpj, result);
    } catch (error) {
      review.push({ messageId: alteration.messageId, reason: error.message });
      blocked.add(alteration.cnpj);
      companies.delete(alteration.cnpj);
    }
  }

  await mkdir('.local', { recursive: true });
  const report = apply ? '.local/gmail-sync-result.json' : '.local/gmail-preview.json';
  await writeFile(report, JSON.stringify({ mode: apply ? 'database' : 'mock', appliedMessages: applied, duplicateMessages: duplicates, ignoredNonQsa: ignored, companies: [...companies.values()], review }, null, 2));
  console.log(`${apply ? 'Banco atualizado' : 'Simulação'}: ${applied} mensagem(ns) processada(s), ${duplicates} já importada(s), ${review.length} para revisão. Veja ${report}.`);
  if (review.length) process.exitCode = 1;
}

function runEveryDays({ apply, everyDays }) {
  const intervalMs = everyDays * 24 * 60 * 60 * 1000;

  const tick = async () => {
    try {
      console.log(`[gmail-sync] Iniciando verificação em ${new Date().toISOString()} (intervalo: ${everyDays} dias)`);
      await runSyncCycle(apply);
      console.log(`[gmail-sync] Próxima execução em ${new Date(Date.now() + intervalMs).toISOString()}`);
    } catch (error) {
      console.error('[gmail-sync] Erro durante sincronização agendada:', error.message);
    }
  };

  void tick();
  setInterval(() => {
    void tick();
  }, intervalMs);
}

async function main(argv = process.argv.slice(2)) {
  const { apply, watch, everyDays } = parseArgs(argv);

  if (watch) {
    runEveryDays({ apply, everyDays });
    return;
  }

  await runSyncCycle(apply);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  }).finally(async () => { await prisma?.$disconnect(); });
}
