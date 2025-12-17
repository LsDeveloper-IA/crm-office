"use client";

type Props = {
  company: {
    corporateName: string;
    cnpj: string;
    taxRegime: string;
    accountant: string;
    publicSpace: string;
    number: string;
    district: string;
    city: string;
    state: string;
    sectors: {
      name: string;
      responsible?: string;
    }[];
  } | null;
  onClose: () => void;
};

export function CompanyDrawer({ company, onClose }: Props) {
  if (!company) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      {/* overlay */}
      <div
        className="flex-1 bg-black/40"
        onClick={onClose}
      />

      {/* drawer */}
      <aside className="w-[420px] bg-white p-6 overflow-auto">
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-xl font-bold">
            {company.corporateName}
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-black"
          >
            Fechar
          </button>
        </div>

        {/* dados gerais */}
        <section className="mb-6">
          <h3 className="font-semibold mb-2">Dados gerais</h3>
          <p><strong>CNPJ:</strong> {company.cnpj}</p>
          <p><strong>Regime:</strong> {company.taxRegime}</p>
          <p><strong>Contador:</strong> {company.accountant}</p>
          <p><strong>Endereço:</strong> {company.publicSpace}</p>
          <p><strong>Número:</strong> {company.number}</p>
          <p><strong>Bairro:</strong> {company.district}</p>
          <p><strong>Cidade:</strong> {company.city}</p>
          <p><strong>Estado:</strong> {company.state}</p>
        </section>

        {/* setores */}
        <section>
          <h3 className="font-semibold mb-2">Setores</h3>

          <div className="space-y-3">
            {company.companySectors.map((sector) => (
              <div
                key={sector.name}
                className="flex justify-between items-center border rounded-lg px-3 py-2"
              >
                <span>{sector.name}</span>
                <span className="text-sm text-muted-foreground">
                  {sector.responsible ?? "Sem responsável"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}