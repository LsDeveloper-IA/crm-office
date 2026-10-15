export function formatCapital(cents: string | null | undefined): string {
  if (cents == null) return "Não apurado";
  const value = BigInt(cents);
  return `R$ ${(value / BigInt(100)).toLocaleString("pt-BR")},${String(value % BigInt(100)).padStart(2, "0")}`;
}

export function sumCapital(values: (string | null | undefined)[]): string | null {
  if (!values.length || values.some(value => value == null)) return null;
  return values.reduce<bigint>((sum, value) => sum + BigInt(value!), BigInt(0)).toString();
}
