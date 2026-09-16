import { ActivityKind, type Prisma } from "@prisma/client";
import prisma from "../prisma";
const MAX_RETRIES = 3;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getOptionalString(
  source: Record<string, unknown>,
  key: string
): string | undefined {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
}

function parseReceitaActivities(
  value: unknown,
  fieldName: string
): ReceitaActivity[] | undefined {
  if (value == null) return undefined;

  if (!Array.isArray(value)) {
    throw new Error(`Campo ${fieldName} invalido na resposta da API.`);
  }

  return value.map((item, index) => {
    if (
      !isRecord(item) ||
      typeof item.code !== "string" ||
      typeof item.text !== "string"
    ) {
      throw new Error(
        `Item ${index} de ${fieldName} invalido na resposta da API.`
      );
    }

    return {
      code: item.code,
      text: item.text,
    };
  });
}

function parseReceitaQsa(value: unknown): ReceitaQsa[] | undefined {
  if (value == null) return undefined;

  if (!Array.isArray(value)) {
    throw new Error("Campo qsa invalido na resposta da API.");
  }

  return value.map((item, index) => {
    if (
      !isRecord(item) ||
      typeof item.nome !== "string" ||
      typeof item.qual !== "string"
    ) {
      throw new Error(`Item ${index} de qsa invalido na resposta da API.`);
    }

    return {
      nome: item.nome,
      qual: item.qual,
    };
  });
}

function parseReceitaResponse(value: unknown): ReceitaResponse {
  if (!isRecord(value)) {
    throw new Error("Resposta invalida da API: JSON nao e um objeto.");
  }

  return {
    status: getOptionalString(value, "status"),
    message: getOptionalString(value, "message"),
    nome: getOptionalString(value, "nome"),
    logradouro: getOptionalString(value, "logradouro"),
    numero: getOptionalString(value, "numero"),
    bairro: getOptionalString(value, "bairro"),
    municipio: getOptionalString(value, "municipio"),
    uf: getOptionalString(value, "uf"),
    qsa: parseReceitaQsa(value.qsa),
    atividade_principal: parseReceitaActivities(
      value.atividade_principal,
      "atividade_principal"
    ),
    atividades_secundarias: parseReceitaActivities(
      value.atividades_secundarias,
      "atividades_secundarias"
    ),
  };
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }
export class ReceitaUpdateError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
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
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
      });

      const text = await res.text();
      let data: ReceitaResponse;

      try {
        const parsed: unknown = JSON.parse(text);
        data = parseReceitaResponse(parsed);
      } catch {
        throw new Error(`Resposta invalida da API: ${text}`);
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      if (data.status === "ERROR") {
        throw new Error(data.message ?? "Erro retornado pela API.");
      }

      return data;
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;

      console.log(`Retry ${attempt}/${MAX_RETRIES}...`);
      await sleep(3000);
    }
  }
  
  throw new Error(`Falha ao consultar a Receita para o CNPJ ${cnpj}.`);
}

export async function updateCompanyFromReceita(rawCnpj: string) {
  const cnpj = sanitizeCnpj(rawCnpj);
  if (!isValidCnpj(cnpj)) throw new ReceitaUpdateError("CNPJ invalido.", 400);
  const company = await prisma.company.findUnique({ where: { cnpj: rawCnpj }, select: { cnpj: true } });
  if (!company) throw new ReceitaUpdateError("Empresa nao encontrada.", 404);
  let data: ReceitaResponse;
  try { data = await fetchReceita(cnpj); }
  catch { throw new ReceitaUpdateError("Falha ao consultar ReceitaWS. Tente novamente mais tarde.", 502); }
  if (!data.nome?.trim()) throw new ReceitaUpdateError("Resposta incompleta da ReceitaWS.", 502);
  await prisma.$transaction(async (tx) => {
      await tx.company.update({
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

      if (data.qsa !== undefined) {
        await tx.companyQsa.deleteMany({
          where: { companyCnpj: rawCnpj },
        });

        const qsaData: Prisma.CompanyQsaCreateManyInput[] = data.qsa.map(
          (partner) => ({
            companyCnpj: rawCnpj,
            nome: partner.nome,
            qualificacao: partner.qual,
          })
        );

        if (qsaData.length > 0) {
          await tx.companyQsa.createMany({
            data: qsaData,
          });
        }
      }

      const activities: Prisma.CompanyActivityCreateManyInput[] = [
        ...(data.atividade_principal ?? []).map((activity) => ({
          companyCnpj: rawCnpj,
          cnaeCode: activity.code,
          description: activity.text,
          kind: ActivityKind.PRIMARY,
        })),
        ...(data.atividades_secundarias ?? []).map((activity) => ({
          companyCnpj: rawCnpj,
          cnaeCode: activity.code,
          description: activity.text,
          kind: ActivityKind.SECONDARY,
        })),
      ];

      const hasActivitiesPayload =
        data.atividade_principal !== undefined ||
        data.atividades_secundarias !== undefined;

      if (hasActivitiesPayload) {
        await tx.companyActivity.deleteMany({
          where: { companyCnpj: rawCnpj },
        });

        if (activities.length > 0) {
          await tx.companyActivity.createMany({
            data: activities,
          });
        }
      }

  });
  return { cnpj: rawCnpj };
}
