export function normalizeCNPJ(cnpj: string) {
  return cnpj.replace(/\D/g, "");
}

export function isValidCNPJ(cnpj: string) {
  const value = normalizeCNPJ(cnpj);
  return value.length === 14;
}