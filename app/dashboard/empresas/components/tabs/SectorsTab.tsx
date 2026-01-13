import type { CompanyDrawerDTO } from "../../dto/company-drawer.dto";

type Sector = CompanyDrawerDTO["companySectors"][number] & {
  tempId: string;
};

type AvailableSector = {
  id: string;
  name: string;
};

type Props = {
  sectors: Sector[];
  availableSectors: AvailableSector[];
  isEditing: boolean;
  onChange: (sectors: Sector[]) => void;
};

export function SectorsTab({
  sectors,
  availableSectors,
  isEditing,
  onChange,
}: Props) {
  function updateSector(tempId: string, sectorId: string) {
    const sector = availableSectors.find(
      (s) => s.id === sectorId
    );
    if (!sector) return;

    onChange(
      sectors.map((s) =>
        s.tempId === tempId
          ? {
              ...s,
              sectorId: sector.id,
              sectorName: sector.name,
            }
          : s
      )
    );
  }

  function updateOwner(tempId: string, value: string) {
    onChange(
      sectors.map((s) =>
        s.tempId === tempId
          ? { ...s, owner: value || undefined }
          : s
      )
    );
  }

  function addSector() {
    onChange([
      ...sectors,
      {
        tempId: crypto.randomUUID(),
        sectorId: "",
        sectorName: "",
        owner: undefined,
      },
    ]);
  }

  function removeSector(tempId: string) {
    onChange(sectors.filter((s) => s.tempId !== tempId));
  }
  console.log("SECTORS STATE:", sectors);
  console.log("AVAILABLE:", availableSectors);

  return (
    <div className="space-y-3">
      {sectors.map((sector) => (
        <div
          key={sector.tempId}
          className="border rounded-lg px-4 py-3 flex items-center gap-3"
        >
          {/* SETOR */}
          {isEditing ? (
            <select
              className="input text-sm flex-1"
              value={sector.sectorId}
              onChange={(e) =>
                updateSector(sector.tempId, e.target.value)
              }
            >
              <option value="">
                Selecione um setor
              </option>

              {availableSectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="font-medium flex-1">
              {sector.sectorName || "-"}
            </span>
          )}

          {/* RESPONSÁVEL */}
          {isEditing ? (
            <input
              className="input text-sm w-40"
              placeholder="Responsável"
              value={sector.owner ?? ""}
              onChange={(e) =>
                updateOwner(sector.tempId, e.target.value)
              }
            />
          ) : (
            <span className="text-sm text-muted-foreground">
              {sector.owner ?? "Sem responsável"}
            </span>
          )}

          {isEditing && (
            <button
              className="text-xs text-red-500"
              onClick={() =>
                removeSector(sector.tempId)
              }
            >
              Remover
            </button>
          )}
        </div>
      ))}

      {isEditing && (
        <button
          className="text-sm text-muted-foreground"
          onClick={addSector}
        >
          + Adicionar setor
        </button>
      )}
    </div>
  );
}