export const DIVIDEND_TAXATION_OPTIONS = [
  { value: "ISENTO", label: "Isento" },
  { value: "TRIBUTADO", label: "Tributado" },
] as const;

export type DividendTaxationValue = (typeof DIVIDEND_TAXATION_OPTIONS)[number]["value"];

export function isDividendTaxation(value: unknown): value is DividendTaxationValue {
  return value === "ISENTO" || value === "TRIBUTADO";
}

export function getMajorityDividendTaxation(
  months: ReadonlyArray<{ dividendTaxation?: DividendTaxationValue | null }>
): DividendTaxationValue | "EMPATE" | "" {
  let exempt = 0;
  let taxed = 0;
  for (const month of months) {
    if (month.dividendTaxation === "ISENTO") exempt++;
    if (month.dividendTaxation === "TRIBUTADO") taxed++;
  }
  if (exempt === 0 && taxed === 0) return "";
  if (exempt === taxed) return "EMPATE";
  return exempt > taxed ? "ISENTO" : "TRIBUTADO";
}
