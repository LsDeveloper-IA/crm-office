import { ProfitDistributionStatus } from "@prisma/client";

export const PROFIT_DISTRIBUTION_STATUS_OPTIONS = [
  {
    value: ProfitDistributionStatus.NAO_ENCERRADO,
    label: "Não encerrado",
    shortLabel: "Não encerrado",
    className: "bg-yellow-100 text-yellow-700 border-yellow-300",
  },
  {
    value: ProfitDistributionStatus.ENCERRADO_COM_LUCRO,
    label: "Encerrado com lucro",
    shortLabel: "Enc. lucro",
    className: "bg-green-100 text-green-700 border-green-300",
  },
  {
    value: ProfitDistributionStatus.ENCERRADO_COM_PREJUIZO,
    label: "Encerrado com prejuízo",
    shortLabel: "Enc. prejuízo",
    className: "bg-red-100 text-red-700 border-red-300",
  },
] as const;

export const PROFIT_DISTRIBUTION_STATUS_VALUES =
  PROFIT_DISTRIBUTION_STATUS_OPTIONS.map((status) => status.value);

export const PROFIT_DISTRIBUTION_STATUS_CONFIG = Object.fromEntries(
  PROFIT_DISTRIBUTION_STATUS_OPTIONS.map((status) => [status.value, status])
) as Record<ProfitDistributionStatus, (typeof PROFIT_DISTRIBUTION_STATUS_OPTIONS)[number]>;

export function isProfitDistributionStatus(
  value: unknown
): value is ProfitDistributionStatus {
  return (
    typeof value === "string" &&
    PROFIT_DISTRIBUTION_STATUS_VALUES.includes(value as ProfitDistributionStatus)
  );
}

export function normalizeProfitDistributionStatus(
  value: unknown,
  fallback: ProfitDistributionStatus = ProfitDistributionStatus.NAO_ENCERRADO
): ProfitDistributionStatus {
  if (isProfitDistributionStatus(value)) {
    return value;
  }

  return fallback;
}

export function getProfitDistributionStatusOrNull(
  value: unknown
): ProfitDistributionStatus | null {
  return isProfitDistributionStatus(value) ? value : null;
}
