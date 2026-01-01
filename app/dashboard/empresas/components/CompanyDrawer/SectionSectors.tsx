// SectionSectors.tsx
type Sector = {
  sector: { name: string };
  owner: { username: string } | null;
};

type Props = {
  sectors: Sector[];
};

export function SectionSectors({ sectors }: Props) {
  return (
    <section>
      <h3 className="font-semibold mb-2">Setores</h3>

      {sectors.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum setor cadastrado
        </p>
      )}

      <div className="space-y-2">
        {sectors.map((cs) => (
          <div
            key={cs.sector.name}
            className="flex justify-between items-center border rounded-lg px-3 py-2 text-sm"
          >
            <span>{cs.sector.name}</span>
            <span className="text-muted-foreground">
              {cs.owner?.username ?? "Sem responsável"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}