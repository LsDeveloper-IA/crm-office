import type { CompanyDrawerDTO } from "../../dto/company-drawer.dto";

type Partner = NonNullable<CompanyDrawerDTO["partners"]>[number];

function money(cents: string | null) {
  if (cents == null) return "Não informado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(Number(cents) / 100);
}

function PartnerCard({ partner }: { partner: Partner }) {
  const id = partner.cnpj
    ? `CNPJ: ${partner.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}`
    : partner.cpf
      ? `CPF: ${partner.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}`
      : "CPF/CNPJ não informado";
  return (
    <article className="rounded-md border px-3 py-3">
      <h3 className="font-medium">{partner.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{id}</p>
      {partner.isCorporate
        ? <p className="text-sm text-muted-foreground">Pessoa jurídica</p>
        : <p className="text-sm text-muted-foreground">Nascimento: {partner.birthDate?.split("-").reverse().join("/") ?? "Não informado"}</p>}
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Participação</dt><dd>{partner.percentage == null ? "Não informada" : `${partner.percentage}%`}</dd>
        <dt className="text-muted-foreground">Valor das quotas</dt><dd>{money(partner.valueCents)}</dd>
        <dt className="text-muted-foreground">Quantidade de quotas</dt><dd>{partner.quotas == null ? "Não informada" : Number(partner.quotas).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</dd>
      </dl>
    </article>
  );
}

export function QsaTab({ qsas, partners = [] }: {
  qsas: { nome: string; qualificacao: string }[];
  partners?: Partner[];
}) {
  const partnerNames = new Set(partners.map(partner => partner.name.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()));
  const legacy = qsas.filter(qsa => !partnerNames.has(qsa.nome.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim()));
  if (!partners.length && !legacy.length) {
    return <p className="text-sm text-muted-foreground">Nenhum sócio cadastrado</p>;
  }
  return (
    <div className="space-y-3">
      {partners.length > 0 && <>
        <h3 className="text-sm font-semibold">Sócios cadastrados</h3>
        {partners.map((partner, index) => <PartnerCard key={`${partner.cpf ?? partner.cnpj ?? partner.name}-${index}`} partner={partner} />)}
      </>}
      {legacy.length > 0 && <>
        <h3 className="text-sm font-semibold">Outros registros QSA</h3>
        {legacy.map((qsa, index) => <div key={`${qsa.nome}-${index}`} className="flex justify-between rounded-md border px-3 py-2">
          <span>{qsa.nome}</span><span className="text-sm text-muted-foreground">{qsa.qualificacao}</span>
        </div>)}
      </>}
    </div>
  );
}
