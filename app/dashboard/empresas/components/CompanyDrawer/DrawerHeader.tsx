// DrawerHeader.tsx
import type { CompanyDetailsDTO } from "../../dto";

type Props = {
  company: CompanyDetailsDTO;
  onClose: () => void;
};

export function DrawerHeader({ company, onClose }: Props) {
  return (
    <div className="p-6 border-b flex justify-between items-start">
      <h2 className="text-xl font-bold">
        {company.name ?? "-"}
      </h2>

      <button
        onClick={onClose}
        className="text-sm text-muted-foreground hover:text-black"
      >
        Fechar
      </button>
    </div>
  );
}