"use client";

import { useCompanyDrawerData } from "../hooks/useCompanyDrawerData";
import { CompanyDrawerContent } from "./CompanyDrawerContent";

type Props = {
  cnpj: string | null;
  onClose: () => void;
};

export function CompanyDrawer({ cnpj, onClose }: Props) {

  const { data: company, loading } =
    useCompanyDrawerData(cnpj);
console.log(company)
  if (loading || !company) {
    return (
      <div className="fixed inset-0 z-50 flex">
        <div className="flex-1 bg-black/40" onClick={onClose} />
        <aside className="w-[480px] bg-white p-6">
          Carregando dados da empresa...
        </aside>
      </div>
    );
  }

  return (
    <CompanyDrawerContent
      company={company}
      onClose={onClose}
    />
  );
}