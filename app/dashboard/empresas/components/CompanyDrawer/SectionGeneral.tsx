import type { CompanyDetailsDTO } from "../../dto";

type Props = {
  company: CompanyDetailsDTO;
};

export function SectionGeneral({ company }: Props) {
  return (
    <section>
      <h3 className="font-semibold mb-2">Dados gerais</h3>

      <div className="space-y-1 text-sm">
        <p><strong>CNPJ:</strong> {company.cnpj}</p>
        <p><strong>Regime:</strong> {company.profile?.taxRegime ?? "-"}</p>
        <p><strong>Contador:</strong> {company.profile?.accountant ?? "-"}</p>
      </div>
    </section>
  );
}