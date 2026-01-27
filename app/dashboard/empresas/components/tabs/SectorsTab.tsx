// Defined types
type UIOwner = {
  id?: string;
  name: string;
  tempId: string;
}; // Tables types companySectorsOwners

type UISector = {
  tempId: string;
  sectorId: string;
  sectorName: string;

  // Secondary owners
  owners: UIOwner[];

  // Primary owner
  ownerLegacy?: string;
};

type AvailableSector = {
  id: string;
  name: string;
};

type Props = {
  sectors: UISector[];
  availableSectors: AvailableSector[];
  isEditing: boolean;
  onChange: (sectors: UISector[]) => void;
};

export function SectorsTab({
  sectors,
  availableSectors,
  isEditing,
  onChange,
}: Props) {

  function updateSector(tempId: string, sectorId: string) {
    const sector = availableSectors.find((s) => s.id === sectorId);
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

  function addSector() {
    onChange([
      ...sectors,
      {
        tempId: crypto.randomUUID(),
        sectorId: "",
        sectorName: "",
        owners: [],
      },
    ]);
  }

  function removeSector(tempId: string) {
    onChange(sectors.filter((s) => s.tempId !== tempId));
  }

  function addOwner(sectorTempId: string) {
    onChange(
      sectors.map((s) =>
        s.tempId === sectorTempId
          ? {
              ...s,
              owners: [
                ...s.owners,
                {
                  tempId: crypto.randomUUID(),
                  name: "",
                },
              ],
            }
          : s
      )
    );
  }

  function updateOwner(
    sectorTempId: string,
    ownerTempId: string,
    value: string
  ) {
    onChange(
      sectors.map((s) =>
        s.tempId === sectorTempId
          ? {
              ...s,
              owners: s.owners.map((o) =>
                o.tempId === ownerTempId
                  ? { ...o, name: value }
                  : o
              ),
            }
          : s
      )
    );
  }

  function removeOwner(
    sectorTempId: string,
    ownerTempId: string
  ) {
    onChange(
      sectors.map((s) =>
        s.tempId === sectorTempId
          ? {
              ...s,
              owners: s.owners.filter(
                (o) => o.tempId !== ownerTempId
              ),
            }
          : s
      )
    );
  }

  function updateOwnerLegacy(
    sectorTempId: string,
    value: string
  ) {
    onChange(
      sectors.map((s) =>
        s.tempId === sectorTempId
          ? {
              ...s,
              ownerLegacy: value,
            }
          : s
      )
    );
  }

  /* ======================
      RENDER
  ====================== */

  return (
    <div className="space-y-3">
      {sectors.map((sector) => (
        <div
          key={sector.tempId}
          className="border rounded-lg px-4 py-3 space-y-2"
        >
          {/* HEADER */}
          <div className="flex items-center gap-3">
            {isEditing ? (
              <select
                className="input text-sm flex-1 cursor-pointer"
                value={sector.sectorId}
                onChange={(e) =>
                  updateSector(sector.tempId, e.target.value)
                }
              >
                <option value="">Selecione um setor</option>
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

            {isEditing && (
              <button
                className="text-xs text-red-500 cursor-pointer"
                onClick={() => removeSector(sector.tempId)}
              >
                Remover setor
              </button>
            )}
          </div>

          {/* RESPONSÁVEIS */}
          <div className="space-y-1 pl-1">
            {/* LEGADO */}
            {isEditing ? (
              <input
                className="input text-sm"
                placeholder="Responsável Principal"
                value={sector.ownerLegacy ?? ""}
                onChange={(e) =>
                  updateOwnerLegacy(sector.tempId, e.target.value)
                }
              />
            ) : (
              sector.ownerLegacy && (
                <span className="text-sm italic text-muted-foreground block">
                  Responsável Principal: {sector.ownerLegacy}
                </span>
              )
            )}


            {/* NOVOS */}
            {isEditing ? (
              <>
                {sector.owners.map((owner) => (
                  <div
                    key={owner.tempId}
                    className="flex items-center gap-2"
                  >
                    <input
                      className="input text-sm flex-1"
                      placeholder="Responsável Assistente"
                      value={owner.name}
                      onChange={(e) =>
                        updateOwner(
                          sector.tempId,
                          owner.tempId,
                          e.target.value
                        )
                      }
                    />

                    <button
                      className="text-xs text-red-500 cursor-pointer"
                      onClick={() =>
                        removeOwner(
                          sector.tempId,
                          owner.tempId
                        )
                      }
                    >
                      Remover
                    </button>
                  </div>
                ))}

                <button
                  className="text-xs text-muted-foreground cursor-pointer"
                  onClick={() => addOwner(sector.tempId)}
                >
                  + Adicionar responsável
                </button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">
                {sector.owners.length > 0
                  ? `Responsável Assistente: ${sector.owners.map((o) => o.name).join(", ")}`
                  : ""}
              </span>
            )}
          </div>
        </div>
      ))}

      {isEditing && (
        <button
          className="text-sm text-muted-foreground cursor-pointer"
          onClick={addSector}
        >
          + Adicionar setor
        </button>
      )}
    </div>
  );
}
