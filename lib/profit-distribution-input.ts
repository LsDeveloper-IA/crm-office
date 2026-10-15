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

type PartnerFilterRow = {
  partnerId: number;
  partnerName: string;
};

function isNoPartnersPlaceholder(partner: PartnerFilterRow): boolean {
  const normalizedName = normalizeDistributionSearch(partner.partnerName);
  return partner.partnerId === -999999
    || normalizedName === "sem socio"
    || normalizedName === "sem socios";
}

export function hasOnlyNoPartnersPlaceholder(partners: PartnerFilterRow[]): boolean {
  return partners.length > 0 && partners.every(isNoPartnersPlaceholder);
}

export function hasNoPartnersPlaceholder(partners: PartnerFilterRow[]): boolean {
  return partners.some(isNoPartnersPlaceholder);
}

export function hasMixedNoPartnersPlaceholder(partners: PartnerFilterRow[]): boolean {
  return hasNoPartnersPlaceholder(partners)
    && partners.some(partner => !isNoPartnersPlaceholder(partner));
}

export function matchesPartnerFilter(
  partners: PartnerFilterRow[],
  filter: "all" | "case-aside" | "without-documents" | "without-drive-folder",
  caseAside: boolean,
  withoutDocuments = false,
  withoutDriveFolder = false,
): boolean {
  if (hasNoPartnersPlaceholder(partners)) return filter === "case-aside";
  if (withoutDriveFolder) return filter === "without-drive-folder";
  if (filter === "without-drive-folder") return false;
  if (filter === "without-documents") return withoutDocuments;
  if (withoutDocuments) return false;
  if (filter === "case-aside") return caseAside;
  return !caseAside;
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
