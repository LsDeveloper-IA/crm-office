import "dotenv/config";
import { getOrCreateCompanyByCnpj } from "@/lib/company/company.create";

/**
 * CONFIGURAÇÕES
 */
const DELAY_MS = 20000; // 👈 delay entre chamadas (recomendado 2–3s)
const MAX_RETRIES = 3;

/**
 * CNPJs (remove duplicados automaticamente)
 */
const CNPJS = Array.from(
  new Set([
    "35065192000107"
  ])
);  

/**
 * Utilitário de delay
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry simples com backoff
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;

    console.warn(
      `⚠️ Erro temporário. Tentando novamente em ${DELAY_MS}ms... (${retries} restantes)`
    );

    await sleep(DELAY_MS);
    return withRetry(fn, retries - 1);
  }
}

async function run() {

  let success = 0;
  let failed = 0;

  for (let i = 0; i < CNPJS.length; i++) {
    const rawCnpj = CNPJS[i];
    const cnpj = rawCnpj.replace(/\D/g, "");


    try {
      const company = await withRetry(() =>
        getOrCreateCompanyByCnpj(cnpj)
      );

      console.log(
        `   ✅ ${company.name} importada com sucesso`
      );
      success++;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : String(err);
      console.error(
        `   ❌ Falha ao importar ${cnpj}:`,
        message
      );
      failed++;
    }

    // delay entre empresas (mesmo se der erro)
    await sleep(DELAY_MS);
  }

  console.log("\n🏁 Importação finalizada");
  console.log(`✅ Sucesso: ${success}`);
  console.log(`❌ Falhas: ${failed}`);

  process.exit(0);
}

run();
