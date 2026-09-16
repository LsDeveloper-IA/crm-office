import "dotenv/config";
import { updateCompanyFromReceita } from "../../lib/receita/update-company";
import fs from "fs";
import cliProgress from "cli-progress";
import prisma from "../../lib/prisma";

const DELAY = 20000;
const MAX_CONSECUTIVE_ERRORS = 5;

const CHECKPOINT = "./scripts/receita-checkpoint.json";
const ERROR_LOG = "./scripts/receita-errors.log";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Erro desconhecido";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCheckpoint(): number {
  if (!fs.existsSync(CHECKPOINT)) return 0;

  const rawData: unknown = JSON.parse(fs.readFileSync(CHECKPOINT, "utf8"));

  if (typeof rawData !== "object" || rawData === null || !("index" in rawData) || typeof rawData.index !== "number") {
    return 0;
  }

  return rawData.index;
}

function saveCheckpoint(index: number): void {
  fs.writeFileSync(CHECKPOINT, JSON.stringify({ index }));
}

function logError(message: string): void {
  fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${message}\n`);
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  // Sem argumentos mantém o lote; parâmetros inválidos nunca iniciam o lote.
  if (args.length) {
    if (args.length !== 2 || args[0] !== "--cnpj" || !/^\d{14}$/.test(args[1])) {
      throw new Error("Uso: tsx scripts/companies/updateCompaniesReceita.ts [--cnpj 12345678000199]");
    }
    await updateCompanyFromReceita(args[1]);
    console.log("Empresa atualizada com sucesso.");
    return;
  }
  const companies = await prisma.company.findMany({
    select: {
      cnpj: true,
    },
    orderBy: { cnpj: "asc" },
  });

  const start = getCheckpoint();

  console.log(`Empresas encontradas: ${companies.length}`);
  console.log(`Retomando do indice: ${start}`);

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


    try {
      await updateCompanyFromReceita(rawCnpj);

      saveCheckpoint(i + 1);
      progress.update(i + 1);
      consecutiveErrors = 0;

      console.log("Atualizado com sucesso");

      await sleep(DELAY);
    } catch (error: unknown) {
      consecutiveErrors++;

      const errorMessage = getErrorMessage(error);

      console.error(`Erro no CNPJ ${rawCnpj}`);
      console.error(errorMessage);

      logError(`${rawCnpj} - ${errorMessage}`);

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        progress.stop();
        console.error("\nMuitos erros consecutivos. Script interrompido.");
        throw new Error("Lote interrompido por erros consecutivos.");
      }

      console.log("Pulando empresa...");

      progress.update(i + 1);
      saveCheckpoint(i + 1);

      await sleep(DELAY);
    }
  }

  progress.stop();

  console.log("\nAtualizacao finalizada!");

  if (fs.existsSync(CHECKPOINT)) {
    fs.unlinkSync(CHECKPOINT);
  }
}

run().catch((error: unknown) => {
  console.error(getErrorMessage(error));
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
