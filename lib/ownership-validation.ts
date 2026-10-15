import { z } from "zod";
import { ownershipEventSchema } from "./ownership";

export function validCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const length of [9, 10]) {
    const sum = [...cpf.slice(0, length)].reduce((total, digit, index) =>
      total + Number(digit) * (length + 1 - index), 0);
    const digit = (sum * 10) % 11;
    if ((digit === 10 ? 0 : digit) !== Number(cpf[length])) return false;
  }
  return true;
}

const partnerNameSchema = z.string().trim().min(2).refine(
  value => /[A-Za-zÀ-ÖØ-öø-ÿ]{2}/u.test(value), "Nome de sócio inválido",
);

export const extractedPartnerSchema = z.object({
  cpf: z.string().refine(validCpf, "CPF inválido").nullable(),
  partnerCnpj: z.string().regex(/^\d{14}$/).nullable().optional(),
  name: partnerNameSchema,
  birthDate: z.iso.date().refine(value => value <= new Date().toISOString().slice(0, 10),
    "Nascimento futuro").nullable(),
  ownershipHistory: z.array(ownershipEventSchema).min(1),
}).superRefine((partner, context) => {
  if (Boolean(partner.cpf) === Boolean(partner.partnerCnpj)) {
    context.addIssue({ code: "custom", message: "Informe CPF ou CNPJ, exclusivamente" });
  }
  if (partner.cpf && !partner.birthDate) {
    context.addIssue({ code: "custom", path: ["birthDate"], message: "Nascimento ausente: revisar documento" });
  }
});

const ownershipImportBaseSchema = z.object({
  correlationId: z.uuid().nullable().optional(),
  mode: z.enum(["full-history", "latest-aditivo", "document-set", "name-based-history"]).default("full-history"),
  warnings: z.array(z.string()).default([]),
  documents: z.array(z.object({
    sourceFileId: z.string().min(1),
    filename: z.string().min(1),
    status: z.string().min(1),
    issues: z.array(z.string()).default([]),
    mimeType: z.string().nullable().optional(),
    sizeBytes: z.number().int().nonnegative().nullable().optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
    pageIssues: z.array(z.string()).default([]),
    pageMetrics: z.array(z.object({
      page: z.number().int().positive(),
      method: z.enum(["ocr", "native-text"]),
      confidence: z.number().min(0).max(100),
      engine: z.string().optional(),
      strategy: z.string().optional(),
    })).default([]),
    classification: z.object({
      category: z.string(), score: z.number(), approved: z.boolean(),
      scores: z.record(z.string(), z.number()), evidence: z.array(z.string()),
    }).nullable().optional(),
  })).default([]),
  companyCnpj: z.string().regex(/^\d{14}$/),
  partners: z.array(extractedPartnerSchema).min(1),
});

export const ownershipImportSchema = ownershipImportBaseSchema.superRefine((input, context) => {
  if (!input.partners.length) return;
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (new Set(input.partners.map(p => p.cpf ?? p.partnerCnpj)).size !== input.partners.length) fail("Documento duplicado");
  const baseline = input.partners[0].ownershipHistory;
  if (input.mode === "latest-aditivo" && baseline.length !== 1) fail("Esperado um único aditivo");
  baseline.forEach((event, index) => {
    const previous = baseline[index - 1];
    if (previous && (event.effectiveAt < previous.effectiveAt ||
      (event.effectiveAt === previous.effectiveAt && event.sequence <= previous.sequence))) fail("Histórico fora de ordem");
    let total = 0;
    for (const partner of input.partners) {
      const other = partner.ownershipHistory[index];
      if (partner.ownershipHistory.length !== baseline.length || !other ||
        (["effectiveAt", "sequence", "capitalCents", "sourceFileId", "sourceHash"] as const)
          .some(key => other[key] !== event[key])) fail("Quadros inconsistentes");
      total += other?.percentageBps ?? 0;
    }
    if (total !== 10000 || !/^\d+$/.test(event.capitalCents) || BigInt(event.capitalCents) <= BigInt(0)) fail("Capital/quadro inválido");
  });
});

const qsaSoleOwnerPartnerSchema = z.object({
  cpf: z.string().refine(validCpf, "CPF inv\u00e1lido").nullable(),
  partnerCnpj: z.string().regex(/^\d{14}$/).nullable().optional(),
  name: partnerNameSchema,
  birthDate: z.iso.date().refine(value => value <= new Date().toISOString().slice(0, 10),
    "Nascimento futuro").nullable(),
  ownershipHistory: z.array(ownershipEventSchema).min(1),
}).superRefine((partner, context) => {
  if (partner.cpf && partner.partnerCnpj) {
    context.addIssue({ code: "custom", message: "CPF e CNPJ informados simultaneamente" });
  }
  if (partner.cpf && !partner.birthDate) {
    context.addIssue({ code: "custom", path: ["birthDate"], message: "Nascimento ausente: revisar documento" });
  }
});

export const qsaSoleOwnerImportSchema = ownershipImportBaseSchema.extend({
  mode: z.literal("qsa-sole-owner"),
  partners: z.array(qsaSoleOwnerPartnerSchema).length(1),
}).superRefine((input, context) => {
  const partner = input.partners[0];
  if (!partner) return;
  for (const event of partner.ownershipHistory) {
    if (event.percentageBps !== 10000) {
      context.addIssue({ code: "custom", message: "QSA de sócio único deve fechar em 100%" });
    }
  }
});

export const nameBasedHistoryPartnerSchema = z.object({
  cpf: z.string().refine(validCpf, "CPF inválido").nullable(),
  partnerCnpj: z.string().regex(/^\d{14}$/).nullable().optional(),
  name: partnerNameSchema,
  birthDate: z.iso.date().nullable(),
  ownershipHistory: z.array(ownershipEventSchema).min(1),
}).superRefine((partner, context) => {
  if (partner.cpf && partner.partnerCnpj) {
    context.addIssue({ code: "custom", message: "CPF e CNPJ informados simultaneamente" });
  }
});

export const nameBasedHistoryImportSchema = ownershipImportBaseSchema.extend({
  mode: z.literal("name-based-history"),
  partners: z.array(nameBasedHistoryPartnerSchema).min(1),
}).superRefine((input, context) => {
  const key = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  if (new Set(input.partners.map(partner => key(partner.name))).size !== input.partners.length) {
    context.addIssue({ code: "custom", message: "Nomes de sócios duplicados no quadro" });
  }
  const baseline = input.partners[0].ownershipHistory;
  baseline.forEach((event, index) => {
    let total = 0;
    for (const partner of input.partners) {
      const other = partner.ownershipHistory[index];
      if (partner.ownershipHistory.length !== baseline.length || !other
        || (["effectiveAt", "sequence", "capitalCents", "sourceFileId", "sourceHash"] as const)
          .some(field => other[field] !== event[field])) {
        context.addIssue({ code: "custom", message: "Quadros inconsistentes no histórico por nome" });
      }
      total += other?.percentageBps ?? 0;
    }
    if (total !== 10000) context.addIssue({ code: "custom", message: "Participações devem fechar em 100%" });
  });
});

export const nameOnlyImportSchema = ownershipImportBaseSchema.extend({
  mode: z.literal("names-only"),
  partners: z.array(z.object({
    name: partnerNameSchema,
    partnerCnpj: z.string().regex(/^\d{14}$/).nullable().optional(),
    isCorporate: z.boolean().default(false),
  })).min(1),
}).superRefine((input, context) => {
  const names = input.partners.map(partner => partner.name.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim());
  if (new Set(names).size !== names.length) {
    context.addIssue({ code: "custom", message: "Nomes duplicados no quadro" });
  }
  if (!input.documents.some(document => document.status === "names-only")) {
    context.addIssue({ code: "custom", message: "Quadro societário não identificado" });
  }
});

export const ownershipSyncSchema = z.union([
  ownershipImportSchema, qsaSoleOwnerImportSchema, nameBasedHistoryImportSchema, nameOnlyImportSchema,
]);

type PersistedOwnershipIdentity = {
  name: string;
  cpf: string | null;
  partnerCnpj: string | null;
};

export function findPersistedOwnershipPartner<T extends PersistedOwnershipIdentity>(
  partners: readonly T[],
  expected: PersistedOwnershipIdentity,
): T | undefined {
  const identityMatches = partners.filter(partner =>
    (expected.cpf && partner.cpf === expected.cpf)
    || (expected.partnerCnpj && partner.partnerCnpj === expected.partnerCnpj));
  if (identityMatches.length === 1) return identityMatches[0];
  if (identityMatches.length > 1) return undefined;

  const key = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const nameMatches = partners.filter(partner => key(partner.name) === key(expected.name));
  return nameMatches.length === 1 ? nameMatches[0] : undefined;
}

export function persistenceIssues(
  expected: z.infer<typeof extractedPartnerSchema> | z.infer<typeof qsaSoleOwnerPartnerSchema>,
  stored: unknown,
  allowMissingIdentity = false,
  allowMissingBirth = false,
): string[] {
  const validator = allowMissingBirth ? nameBasedHistoryPartnerSchema
    : allowMissingIdentity ? qsaSoleOwnerPartnerSchema : extractedPartnerSchema;
  const parsed = validator.safeParse(stored);
  if (!parsed.success) return ["cadastro ausente ou inválido"];
  const actual = parsed.data;
  const issues: string[] = [];
  for (const field of ["name", "cpf", "birthDate", "partnerCnpj"] as const) {
    if ((actual[field] ?? null) !== (expected[field] ?? null)) issues.push(field);
  }
  for (const event of expected.ownershipHistory) {
    const saved = actual.ownershipHistory.find(item => item.effectiveAt === event.effectiveAt && item.sequence === event.sequence);
    if (!saved || (Object.keys(event) as (keyof typeof event)[]).some(key => saved[key] !== event[key])) {
      issues.push(`evento ${event.effectiveAt}/${event.sequence}`);
    }
  }
  return issues;
}
