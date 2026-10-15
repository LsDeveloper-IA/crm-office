import { z } from "zod";

export const ownershipEventSchema = z.object({
  effectiveAt: z.iso.date(),
  sequence: z.number().int().nonnegative(),
  percentageBps: z.number().int().min(0).max(10000),
  previousPercentageBps: z.number().int().min(0).max(10000).optional(),
  capitalCents: z.string().regex(/^\d+$/).max(20),
  ownershipValueCents: z.string().regex(/^\d+$/).max(20).optional(),
  quotas: z.string().regex(/^\d+(\.\d+)?$/).max(30).optional(),
  quotaValueCents: z.string().regex(/^\d+$/).max(20).optional(),
  sourceFileId: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export type OwnershipEvent = z.infer<typeof ownershipEventSchema>;

export function mergeOwnershipEvent(history: unknown, incoming: OwnershipEvent) {
  const events = z.array(ownershipEventSchema).parse(history ?? []);
  const compare = (a: OwnershipEvent, b: OwnershipEvent) =>
    a.effectiveAt.localeCompare(b.effectiveAt) || a.sequence - b.sequence;
  if (events.some(event => compare(event, incoming) > 0)) {
    throw new Error("O último arquivo enviado tem vigência anterior ao histórico; revise antes de importar");
  }
  const sameSource = events.find(event => event.sourceFileId === incoming.sourceFileId);
  if (sameSource && compare(sameSource, incoming) !== 0) {
    throw new Error("Vigência do documento já importado foi alterada; revise o histórico");
  }
  return [...events.filter(event => compare(event, incoming) !== 0), incoming].sort(compare);
}

export function ownershipAt(history: unknown, through: string) {
  const events = z.array(ownershipEventSchema).parse(history ?? [])
    .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt) || a.sequence - b.sequence);
  return events.filter((event) => event.effectiveAt <= through).at(-1);
}

export function ownershipForYear(history: unknown, year: number) {
  const now = new Date().toISOString().slice(0, 10);
  const end = `${year}-12-31`;
  const current = ownershipAt(history, end < now ? end : now);
  const months = Array.from({ length: 12 }, (_, month) => {
    const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const previousDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
    const before = ownershipAt(history, previousDay);
    const after = ownershipAt(history, lastDay);
    const firstInMonth = z.array(ownershipEventSchema).parse(history ?? [])
      .filter(event => event.effectiveAt >= start && event.effectiveAt <= lastDay)
      .sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt) || a.sequence - b.sequence)[0];
    const previousBps = before?.percentageBps ?? firstInMonth?.previousPercentageBps
      ?? (firstInMonth && after && (firstInMonth.effectiveAt !== after.effectiveAt || firstInMonth.sequence !== after.sequence)
        ? firstInMonth.percentageBps : null);
    return {
      month,
      ownershipPercentage: after ? after.percentageBps / 100 : null,
      // The original contract establishes a baseline, not a gain from zero.
      ownershipDelta: after && after.effectiveAt >= start && previousBps != null
        ? (after.percentageBps - previousBps) / 100 : null,
    };
  });
  return {
    ownershipPercentage: current ? current.percentageBps / 100 : null,
    ownershipValueCents: current?.ownershipValueCents ?? (current
      ? ((BigInt(current.capitalCents) * BigInt(current.percentageBps) + BigInt(5000)) / BigInt(10000)).toString() : null),
    quotas: current?.quotas ?? null,
    months,
  };
}

export type SafeOwnershipResult = ReturnType<typeof ownershipForYear> & {
  valid: boolean;
  issue: string | null;
};

/**
 * Read-path boundary for legacy/corrupted JSON. Import remains strict, while one bad
 * partner can no longer make the whole dashboard fail during server rendering.
 */
export function safeOwnershipForYear(history: unknown, year: number): SafeOwnershipResult {
  try {
    return { ...ownershipForYear(history, year), valid: true, issue: null };
  } catch {
    return {
      ownershipPercentage: null,
      ownershipValueCents: null,
      quotas: null,
      months: Array.from({ length: 12 }, (_, month) => ({
        month,
        ownershipPercentage: null,
        ownershipDelta: null,
      })),
      valid: false,
      issue: "Histórico societário inválido; reprocessamento necessário",
    };
  }
}
