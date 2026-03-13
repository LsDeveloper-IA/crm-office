import "dotenv/config";
import prisma from "../../lib/prisma";
import fs from "fs";
import cliProgress from "cli-progress";

const DELAY = 20000;
const MAX_RETRIES = 3;
const MAX_CONSECUTIVE_ERRORS = 5;

const CHECKPOINT = "./scripts/receita-checkpoint.json";
const ERROR_LOG = "./scripts/receita-errors.log";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getCheckpoint() {
  if (!fs.existsSync(CHECKPOINT)) return 0;
  return JSON.parse(fs.readFileSync(CHECKPOINT, "utf8")).index ?? 0;
}

function saveCheckpoint(index: number) {
  fs.writeFileSync(CHECKPOINT, JSON.stringify({ index }));
}

function logError(message: string) {
  fs.appendFileSync(
    ERROR_LOG,
    `[${new Date().toISOString()}] ${message}\n`
  );
}

function sanitizeCnpj(cnpj: string) {
  return cnpj.replace(/\D/g, "");
}

function isValidCnpj(cnpj: string) {
  return /^\d{14}$/.test(cnpj);
}

async function fetchReceita(cnpj: string) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(
        `https://receitaws.com.br/v1/cnpj/${cnpj}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "application/json",
          },
        }
      );

      const text = await res.text();

      let data;

      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Resposta inválida da API: ${text}`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      if (data.status === "ERROR") {
        throw new Error(data.message);
      }

      return data;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;

      console.log(`Retry ${attempt}/${MAX_RETRIES}...`);
      await sleep(3000);
    }
  }
}

async function run() {
  const companies = await prisma.company.findMany({
    select: {
      cnpj: true,
      name: true,
    },
    orderBy: { cnpj: "asc" },
  });

  const start = getCheckpoint();

  console.log(`Empresas encontradas: ${companies.length}`);
  console.log(`Retomando do índice: ${start}`);

  const progress = new cliProgress.SingleBar(
    {
      format:
        "Progresso |{bar}| {percentage}% | {value}/{total} | ETA: {eta_formatted}",
    },
    cliProgress.Presets.shades_classic
  );

  progress.start(companies.length, start);

  let consecutiveErrors = 0;

  for (let i = start; i < companies.length; i++) {
    const rawCnpj = companies[i].cnpj;
    const cnpj = sanitizeCnpj(rawCnpj);

    try {
      if (!isValidCnpj(cnpj)) {
        throw new Error(`CNPJ inválido após sanitização: ${rawCnpj}`);
      }

      console.log(`\nConsultando ${cnpj}`);

      const data = await fetchReceita(cnpj);

      /* =====================
         EMPRESA
      ===================== */

      await prisma.company.update({
        where: { cnpj: rawCnpj },
        data: {
          name: data.nome,
          publicSpace: data.logradouro,
          number: data.numero,
          district: data.bairro,
          city: data.municipio,
          state: data.uf,
        },
      });

      /* =====================
         QSA
      ===================== */

      if (Array.isArray(data.qsa)) {
        await prisma.companyQsa.deleteMany({
          where: { companyCnpj: rawCnpj },
        });

        await prisma.companyQsa.createMany({
          data: data.qsa.map((s: any) => ({
            companyCnpj: rawCnpj,
            nome: s.nome,
            qualificacao: s.qual,
          })),
        });
      }

      /* =====================
         CNAES
      ===================== */

      const activities = [
        ...(data.atividade_principal ?? []).map((a: any) => ({
          companyCnpj: rawCnpj,
          cnaeCode: a.code,
          description: a.text,
          kind: "PRIMARY",
        })),
        ...(data.atividades_secundarias ?? []).map((a: any) => ({
          companyCnpj: rawCnpj,
          cnaeCode: a.code,
          description: a.text,
          kind: "SECONDARY",
        })),
      ];

      if (activities.length > 0) {
        await prisma.companyActivity.deleteMany({
          where: { companyCnpj: rawCnpj },
        });

        await prisma.companyActivity.createMany({
          data: activities,
        });
      }

      saveCheckpoint(i + 1);
      progress.update(i + 1);

      consecutiveErrors = 0;

      console.log("✔ Atualizado com sucesso");

      await sleep(DELAY);
    } catch (err: any) {
      consecutiveErrors++;

      console.error(`❌ Erro no CNPJ ${rawCnpj}`);
      console.error(err.message);

      logError(`${rawCnpj} - ${err.message}`);

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        progress.stop();

        console.error(
          "\nMuitos erros consecutivos. Script interrompido."
        );

        process.exit(1);
      }

      console.log("Pulando empresa...");

      progress.update(i + 1);

      saveCheckpoint(i + 1);

      await sleep(DELAY);
    }
  }

  progress.stop();

  console.log("\n🎉 Atualização finalizada!");

  if (fs.existsSync(CHECKPOINT)) {
    fs.unlinkSync(CHECKPOINT);
  }
}

run();