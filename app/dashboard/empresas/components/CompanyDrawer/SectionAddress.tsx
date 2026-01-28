import type { CompanyDetailsDTO } from "../../dto";

type Props = {
  company: CompanyDetailsDTO;
};

export function SectionAddress({ company }: Props) {
  return (
    <section>
      <h3 className="font-semibold mb-2">Endereço</h3>

      <div className="space-y-1 text-sm">
        <p>
          {[company.publicSpace, company.number]
            .filter(Boolean)
            .join(", ")}
        </p>
        <p>{company.district ?? "-"}</p>
        <p>
          {company.city ?? "-"} / {company.state ?? "-"}
        </p>
      </div>
    </section>
  );
}