import type { CompanyDrawerDTO } from "../../dto/company-drawer.dto";

type Props = {
  activities: CompanyDrawerDTO["activities"];
};

export function ActivitiesTab({ activities }: Props) {
  const primary = activities.filter(a => a.kind === "PRIMARY");
  const secondary = activities.filter(a => a.kind === "SECONDARY");
  return (
    <div className="space-y-6">
      {/* CNAE PRINCIPAL */}
      <section>
        <h3 className="font-semibold mb-2">Atividade Principal</h3>

        {primary.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma atividade principal cadastrada
          </p>
        )}

        {primary.map((a) => (
          <div
            key={a.cnaeCode}
            className="border rounded-lg px-4 py-2"
          >
            <p className="font-mono text-sm">{a.cnaeCode}</p>
            <p className="text-sm">{a.description}</p>
          </div>
        ))}
      </section>

      {/* CNAEs SECUNDÁRIOS */}
      <section>
        <h3 className="font-semibold mb-2">Atividades Secundárias</h3>

        {secondary.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma atividade secundária
          </p>
        )}

        <div className="space-y-2">
          {secondary.map((a) => (
            <div
              key={a.cnaeCode}
              className="border rounded-lg px-4 py-2"
            >
              <p className="font-mono text-sm">{a.cnaeCode}</p>
              <p className="text-sm">{a.description}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}