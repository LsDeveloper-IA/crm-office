import type { ProfitDistributionStatus } from "@prisma/client";
import type { DividendTaxationValue } from "./dividend-taxation";

export type ProfitCompanySettings = {
  participationPercentage: number | null;
  dividendTaxation: DividendTaxationValue | null;
  status: ProfitDistributionStatus;
  observation: string;
  caseAside: boolean;
};

export const DEFAULT_COMPANY_SETTINGS: ProfitCompanySettings = {
  participationPercentage: null,
  dividendTaxation: null,
  status: "NAO_ENCERRADO",
  observation: "",
  caseAside: false,
};

export function hasCompanySettingsChanges(a: ProfitCompanySettings, b: ProfitCompanySettings) {
  return a.participationPercentage !== b.participationPercentage
    || a.dividendTaxation !== b.dividendTaxation
    || a.status !== b.status || a.observation !== b.observation || a.caseAside !== b.caseAside;
}
