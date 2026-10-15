export function normalizeOwnershipCompanyName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ").trim();
}

export function ownershipCasePolicy(name: string | null) {
  const value = normalizeOwnershipCompanyName(name ?? "");
  if (/^A M P(?: |$)/.test(value) || /^AMANDA MARTINS(?: |$)/.test(value)
    || /^ANA CAROLIN[AE](?: |$)/.test(value) || /^ANTONIO TELES(?: |$)/.test(value)) {
    return { action: "skip" as const, reason: "Pular conforme revisão cadastral" };
  }
  if (/^AGUIAS MIDIA(?:S)?(?: |$)/.test(value)) {
    return { action: "review" as const, reason: "QSA estranho; análise manual necessária" };
  }
  if (/^ASSOCIACAO(?: |$)/.test(value)) {
    return { action: "review" as const, reason: "Associação sem quadro de capital/quotas; verificar dirigentes e forma de cadastro manualmente" };
  }
  if (/^ALPITEL TELECOM(?: |$)/.test(value)) {
    return { action: "corporate-partner" as const, reason: "Cadastrar sócia PJ e identificar representante legal" };
  }
  return { action: "standard" as const, reason: "" };
}
