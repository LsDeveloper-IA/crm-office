export function isNoImportableOwnershipHistoryError(message: string) {
  return /Nenhum\s+hist.{0,2}rico\s+societ.{0,2}rio\s+import.{0,2}vel\s+encontrado/i.test(message);
}

export function isNoOwnershipDocumentError(message: string) {
  return /Nenhum\s+arquivo\s+relacionado\s+ao\s+quadro\s+societ.{0,2}.{0,30}foi\s+identificado\s+pelo\s+nome/i.test(message);
}

export function isAmbiguousExistingPartnerLinkError(message: string) {
  return /V[ií�]nculo\s+amb[ií�]guo\s+por\s+nome\s+e\s+sem\s+CPF\/CNPJ\s+[úu�]nico/i.test(message);
}
