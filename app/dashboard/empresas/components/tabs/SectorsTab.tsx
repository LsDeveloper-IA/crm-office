import type { CompanyDrawerDTO } from "../../dto/company-drawer.dto";

type Sector = CompanyDrawerDTO["companySectors"][number];

type Props = {
  sectors: Sector[];
  isEditing: boolean;
  onChange?: (sectors: Sector[]) => void;
};

export function SectorsTab({ sectors, isEditing, onChange }: Props) {
  if (sectors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum setor vinculado a esta empresa
      </p>
    );
  }

  function updateOwner(index: number, value: string) {
    if (!onChange) return;

    const updated = [...sectors];
    updated[index] = {
      ...updated[index],
      owner: value || undefined,
    };

    onChange(updated);
  }

  function removeSector(index: number) {
    if (!onChange) return;

    const updated = sectors.filter((_, i) => i !== index);
    onChange(updated);
  }

  return (
    <div className="space-y-3">
      {sectors.map((sector, index) => (
        <div
          key={`${sector.sectorName}-${index}`}
          className="border rounded-lg px-4 py-3 flex justify-between items-center gap-4"
        >
          {/* Nome do setor (não editável) */}
          <span className="font-medium">
            {sector.sectorName}
          </span>

          {/* Responsável */}
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                className="input text-sm"
                placeholder="Responsável"
                value={sector.owner ?? ""}
                onChange={(e) =>
                  updateOwner(index, e.target.value)
                }
              />

              <button
                className="text-xs text-red-500"
                onClick={() => removeSector(index)}
              >
                Remover
              </button>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">
              {sector.owner ?? "Sem responsável"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}