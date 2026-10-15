type Props = {
  cpf?: string | null;
  cnpj?: string | null;
  isCorporate?: boolean;
  birthDate?: string | null;
  quotas?: string | null;
  warning?: string | null;
};

export function PartnerOwnershipSummary({ cpf, cnpj, isCorporate, birthDate, quotas, warning }: Props) {
  return (
    <>
      <span className="block text-xs text-muted-foreground">
        {isCorporate || cnpj
          ? `CNPJ: ${cnpj?.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") ?? "Não informado"}`
          : `CPF: ${cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") ?? "Não informado"}`}
        {" · "}{isCorporate || cnpj ? "Pessoa jurídica" : `Nascimento: ${birthDate?.split("-").reverse().join("/") ?? "Não informado"}`}
      </span>
      {quotas && <span className="block text-xs text-muted-foreground">Quotas: {Number(quotas).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</span>}
      {warning && <span className="block text-xs font-medium text-amber-700" role="status">{warning}</span>}
    </>
  );
}
