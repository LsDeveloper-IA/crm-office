export function isValidDistributionNumber(value: unknown, min: number, max: number): boolean {
  if (value == null || value === "") return true;
  if (typeof value !== "number" && typeof value !== "string") return false;
  if (typeof value === "string" && !/^-?\d+(?:\.\d{1,2})?$/.test(value)) return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    && Math.abs(number * 100 - Math.round(number * 100)) < 0.001;
}

export function normalizeDistributionSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

type EditableMonth = {
  participationPercentage?: number | null;
  amount?: number | null;
  dividendTaxation?: string | null;
  status: string;
  observation?: string;
};

export function hasDistributionChanges(current: EditableMonth, original: EditableMonth): boolean {
  return (current.participationPercentage ?? null) !== (original.participationPercentage ?? null)
    || (current.amount ?? null) !== (original.amount ?? null)
    || (current.dividendTaxation ?? null) !== (original.dividendTaxation ?? null)
    || current.status !== original.status
    || (current.observation ?? "") !== (original.observation ?? "");
}
