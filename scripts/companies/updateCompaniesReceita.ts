// import "dotenv/config";
// import { ActivityKind, type Prisma } from "@prisma/client";
// import fs from "fs";
// import cliProgress from "cli-progress";
// import prisma from "../../lib/prisma";

// const DELAY = 20000;
// const MAX_RETRIES = 3;
// const MAX_CONSECUTIVE_ERRORS = 5;

// const CHECKPOINT = "./scripts/receita-checkpoint.json";
// const ERROR_LOG = "./scripts/receita-errors.log";

// type ReceitaActivity = {
//   code: string;
//   text: string;
// };

// type ReceitaQsa = {
//   nome: string;
//   qual: string;
// };

// type ReceitaResponse = {
//   status?: string;
//   message?: string;
//   nome?: string;
//   logradouro?: string;
//   numero?: string;
//   bairro?: string;
//   municipio?: string;
//   uf?: string;
//   qsa?: ReceitaQsa[];
//   atividade_principal?: ReceitaActivity[];
//   atividades_secundarias?: ReceitaActivity[];
// };

// function isRecord(value: unknown): value is Record<string, unknown> {
//   return typeof value === "object" && value !== null;
// }

// function getOptionalString(
//   source: Record<string, unknown>,
//   key: string
// ): string | undefined {
//   const value = source[key];
//   return typeof value === "string" ? value : undefined;
// }

// function parseReceitaActivities(
//   value: unknown,
//   fieldName: string
// ): ReceitaActivity[] | undefined {
//   if (value == null) return undefined;

//   if (!Array.isArray(value)) {
//     throw new Error(`Campo ${fieldName} invalido na resposta da API.`);
//   }

//   return value.map((item, index) => {
//     if (
//       !isRecord(item) ||
//       typeof item.code !== "string" ||
//       typeof item.text !== "string"
//     ) {
//       throw new Error(
//         `Item ${index} de ${fieldName} invalido na resposta da API.`
//       );
//     }

//     return {
//       code: item.code,
//       text: item.text,
//     };
//   });
// }

// function parseReceitaQsa(value: unknown): ReceitaQsa[] | undefined {
//   if (value == null) return undefined;

//   if (!Array.isArray(value)) {
//     throw new Error("Campo qsa invalido na resposta da API.");
//   }

//   return value.map((item, index) => {
//     if (
//       !isRecord(item) ||
//       typeof item.nome !== "string" ||
//       typeof item.qual !== "string"
//     ) {
//       throw new Error(`Item ${index} de qsa invalido na resposta da API.`);
//     }

//     return {
//       nome: item.nome,
//       qual: item.qual,
//     };
//   });
// }

// function parseReceitaResponse(value: unknown): ReceitaResponse {
//   if (!isRecord(value)) {
//     throw new Error("Resposta invalida da API: JSON nao e um objeto.");
//   }

//   return {
//     status: getOptionalString(value, "status"),
//     message: getOptionalString(value, "message"),
//     nome: getOptionalString(value, "nome"),
//     logradouro: getOptionalString(value, "logradouro"),
//     numero: getOptionalString(value, "numero"),
//     bairro: getOptionalString(value, "bairro"),
//     municipio: getOptionalString(value, "municipio"),
//     uf: getOptionalString(value, "uf"),
//     qsa: parseReceitaQsa(value.qsa),
//     atividade_principal: parseReceitaActivities(
//       value.atividade_principal,
//       "atividade_principal"
//     ),
//     atividades_secundarias: parseReceitaActivities(
//       value.atividades_secundarias,
//       "atividades_secundarias"
//     ),
//   };
// }

// function getErrorMessage(error: unknown): string {
//   if (error instanceof Error) return error.message;
//   if (typeof error === "string") return error;
//   return "Erro desconhecido";
// }

// function sleep(ms: number): Promise<void> {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }

// function getCheckpoint(): number {
//   if (!fs.existsSync(CHECKPOINT)) return 0;

//   const rawData: unknown = JSON.parse(fs.readFileSync(CHECKPOINT, "utf8"));

//   if (!isRecord(rawData) || typeof rawData.index !== "number") {
//     return 0;
//   }

//   return rawData.index;
// }

// function saveCheckpoint(index: number): void {
//   fs.writeFileSync(CHECKPOINT, JSON.stringify({ index }));
// }

// function logError(message: string): void {
//   fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${message}\n`);
// }

// function sanitizeCnpj(cnpj: string): string {
//   return cnpj.replace(/\D/g, "");
// }

// function isValidCnpj(cnpj: string): boolean {
//   return /^\d{14}$/.test(cnpj);
// }

// async function fetchReceita(cnpj: string): Promise<ReceitaResponse> {
//   for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
//     try {
//       const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
//         headers: {
//           "User-Agent": "Mozilla/5.0",
//           Accept: "application/json",
//         },
//       });

//       const text = await res.text();
//       let data: ReceitaResponse;

//       try {
//         const parsed: unknown = JSON.parse(text);
//         data = parseReceitaResponse(parsed);
//       } catch {
//         throw new Error(`Resposta invalida da API: ${text}`);
//       }

//       if (!res.ok) {
//         throw new Error(`HTTP ${res.status}`);
//       }

//       if (data.status === "ERROR") {
//         throw new Error(data.message ?? "Erro retornado pela API.");
//       }

//       return data;
//     } catch (error) {
//       if (attempt === MAX_RETRIES) throw error;

//       console.log(`Retry ${attempt}/${MAX_RETRIES}...`);
//       await sleep(3000);
//     }
//   }
  
//   throw new Error(`Falha ao consultar a Receita para o CNPJ ${cnpj}.`);
// }

// async function run(): Promise<void> {
//   const companies = await prisma.company.findMany({
//     select: {
//       cnpj: true,
//     },
//     orderBy: { cnpj: "asc" },
//   });

//   const start = getCheckpoint();

//   console.log(`Empresas encontradas: ${companies.length}`);
//   console.log(`Retomando do indice: ${start}`);

//   const progress = new cliProgress.SingleBar(
//     {
//       format:
//         "Progresso |{bar}| {percentage}% | {value}/{total} | ETA: {eta_formatted}",
//     },
//     cliProgress.Presets.shades_classic
//   );

//   progress.start(companies.length, start);

//   let consecutiveErrors = 0;

//   for (let i = start; i < companies.length; i++) {
//     const rawCnpj = companies[i].cnpj;
//     const cnpj = sanitizeCnpj(rawCnpj);

//     try {
//       if (!isValidCnpj(cnpj)) {
//         throw new Error(`CNPJ invalido apos sanitizacao: ${rawCnpj}`);
//       }

//       console.log(`\nConsultando ${cnpj}`);

//       const data = await fetchReceita(cnpj);

//       await prisma.company.update({
//         where: { cnpj: rawCnpj },
//         data: {
//           name: data.nome,
//           publicSpace: data.logradouro,
//           number: data.numero,
//           district: data.bairro,
//           city: data.municipio,
//           state: data.uf,
//         },
//       });

//       if (data.qsa !== undefined) {
//         await prisma.companyQsa.deleteMany({
//           where: { companyCnpj: rawCnpj },
//         });

//         const qsaData: Prisma.CompanyQsaCreateManyInput[] = data.qsa.map(
//           (partner) => ({
//             companyCnpj: rawCnpj,
//             nome: partner.nome,
//             qualificacao: partner.qual,
//           })
//         );

//         if (qsaData.length > 0) {
//           await prisma.companyQsa.createMany({
//             data: qsaData,
//           });
//         }
//       }

//       const activities: Prisma.CompanyActivityCreateManyInput[] = [
//         ...(data.atividade_principal ?? []).map((activity) => ({
//           companyCnpj: rawCnpj,
//           cnaeCode: activity.code,
//           description: activity.text,
//           kind: ActivityKind.PRIMARY,
//         })),
//         ...(data.atividades_secundarias ?? []).map((activity) => ({
//           companyCnpj: rawCnpj,
//           cnaeCode: activity.code,
//           description: activity.text,
//           kind: ActivityKind.SECONDARY,
//         })),
//       ];

//       const hasActivitiesPayload =
//         data.atividade_principal !== undefined ||
//         data.atividades_secundarias !== undefined;

//       if (hasActivitiesPayload) {
//         await prisma.companyActivity.deleteMany({
//           where: { companyCnpj: rawCnpj },
//         });

//         if (activities.length > 0) {
//           await prisma.companyActivity.createMany({
//             data: activities,
//           });
//         }
//       }

//       saveCheckpoint(i + 1);
//       progress.update(i + 1);
//       consecutiveErrors = 0;

//       console.log("Atualizado com sucesso");

//       await sleep(DELAY);
//     } catch (error: unknown) {
//       consecutiveErrors++;

//       const errorMessage = getErrorMessage(error);

//       console.error(`Erro no CNPJ ${rawCnpj}`);
//       console.error(errorMessage);

//       logError(`${rawCnpj} - ${errorMessage}`);

//       if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
//         progress.stop();
//         console.error("\nMuitos erros consecutivos. Script interrompido.");
//         process.exit(1);
//       }

//       console.log("Pulando empresa...");

//       progress.update(i + 1);
//       saveCheckpoint(i + 1);

//       await sleep(DELAY);
//     }
//   }

//   progress.stop();

//   console.log("\nAtualizacao finalizada!");

//   if (fs.existsSync(CHECKPOINT)) {
//     fs.unlinkSync(CHECKPOINT);
//   }
// }

// run();


import "dotenv/config";
import { ActivityKind, type Prisma } from "@prisma/client";
import prisma from "../../lib/prisma";

const DELAY = 20000;
const MAX_RETRIES = 3;

// 🔥 pega TODOS os CNPJs passados
const inputCnpjs = process.argv.slice(2);

type ReceitaActivity = {
  code: string;
  text: string;
};

type ReceitaQsa = {
  nome: string;
  qual: string;
};

type ReceitaResponse = {
  status?: string;
  message?: string;
  nome?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  qsa?: ReceitaQsa[];
  atividade_principal?: ReceitaActivity[];
  atividades_secundarias?: ReceitaActivity[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

function isValidCnpj(cnpj: string): boolean {
  return /^\d{14}$/.test(cnpj);
}

async function fetchReceita(cnpj: string): Promise<ReceitaResponse> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
      });

      const data = await res.json();

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (data.status === "ERROR") {
        throw new Error(data.message ?? "Erro da API");
      }

      return data;

    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;

      console.log(`Retry ${attempt}/${MAX_RETRIES}...`);
      await sleep(3000);
    }
  }

  throw new Error("Erro inesperado");
}

async function run() {
  if (inputCnpjs.length === 0) {
    console.error("❌ Informe pelo menos 1 CNPJ.");
    console.log("Ex: pnpm ts-node scripts/receita.ts 12345678000199");
    process.exit(1);
  }

  console.log(`🔎 Processando ${inputCnpjs.length} CNPJ(s)...`);

  for (const raw of inputCnpjs) {
    const cnpj = sanitizeCnpj(raw);

    try {
      if (!isValidCnpj(cnpj)) {
        throw new Error(`CNPJ inválido: ${raw}`);
      }

      console.log(`\n📡 Consultando ${cnpj}`);

      const data = await fetchReceita(cnpj);

      // 🔥 UPDATE COMPANY
      await prisma.company.update({
        where: { cnpj },
        data: {
          name: data.nome,
          publicSpace: data.logradouro,
          number: data.numero,
          district: data.bairro,
          city: data.municipio,
          state: data.uf,
        },
      });

      // 🔥 QSA
      if (data.qsa) {
        await prisma.companyQsa.deleteMany({
          where: { companyCnpj: cnpj },
        });

        const qsaData: Prisma.CompanyQsaCreateManyInput[] = data.qsa.map(
          (qsa) => ({
            companyCnpj: cnpj,
            nome: qsa.nome,
            qualificacao: qsa.qual,
          })
        );

        if (qsaData.length > 0) {
          await prisma.companyQsa.createMany({
            data: qsaData,
          });
        }
      }

      // 🔥 CNAE
      const activities: Prisma.CompanyActivityCreateManyInput[] = [
        ...(data.atividade_principal ?? []).map((a) => ({
          companyCnpj: cnpj,
          cnaeCode: a.code,
          description: a.text,
          kind: ActivityKind.PRIMARY,
        })),
        ...(data.atividades_secundarias ?? []).map((a) => ({
          companyCnpj: cnpj,
          cnaeCode: a.code,
          description: a.text,
          kind: ActivityKind.SECONDARY,
        })),
      ];

      if (activities.length > 0) {
        await prisma.companyActivity.deleteMany({
          where: { companyCnpj: cnpj },
        });

        await prisma.companyActivity.createMany({
          data: activities,
        });
      }

      console.log("✅ Atualizado com sucesso");

      await sleep(DELAY);

    } catch (error: any) {
      console.error(`❌ Erro no CNPJ ${raw}`);
      console.error(error.message);
    }
  }

  console.log("\n🚀 Finalizado!");
}

run();