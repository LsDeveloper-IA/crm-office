type OwnershipRow = {
  companyCnpj: string;
  partnerId: number;
  month?: number;
  companyName?: string;
  partnerName?: string;
  partnerCpf?: string | null;
  partnerCnpj?: string | null;
  partnerBirthDate?: string | null;
  companyCapitalCents?: string | null;
  ownershipValueCents?: string | null;
  ownershipPercentage?: number | null;
  ownershipDelta?: number | null;
  ownershipMonths?: unknown;
  visibleMonths?: number[];
  caption?: string;
};

export const ownershipRowKey = (row: OwnershipRow) =>
  `${row.companyCnpj}:${row.partnerId}:${row.month ?? "summary"}`;

// Reconcile server-owned fields and roster while keeping local editable values.
export function mergeOwnershipRows<T extends OwnershipRow>(previous: T[], incoming: T[], previousServerKeys: Set<string>): T[] {
  const previousByKey = new Map(previous.map(row => [ownershipRowKey(row), row]));
  const incomingKeys = new Set(incoming.map(ownershipRowKey));
  const merged = incoming.map(source => {
    const local = previousByKey.get(ownershipRowKey(source));
    if (!local) return source;
    return { ...local,
      companyName: source.companyName, partnerName: source.partnerName,
      partnerCpf: source.partnerCpf, partnerCnpj: source.partnerCnpj,
      partnerBirthDate: source.partnerBirthDate, companyCapitalCents: source.companyCapitalCents,
      ownershipValueCents: source.ownershipValueCents, ownershipPercentage: source.ownershipPercentage,
      ownershipDelta: source.ownershipDelta, ownershipMonths: source.ownershipMonths,
      visibleMonths: source.visibleMonths, caption: source.caption,
    };
  });
  // Retain rows created locally while a server request was in flight.
  return [...merged, ...previous.filter(row => !incomingKeys.has(ownershipRowKey(row))
    && !previousServerKeys.has(ownershipRowKey(row)))];
}
