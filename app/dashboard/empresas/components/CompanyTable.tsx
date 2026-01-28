"use client";

import { useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CompanyDrawer } from "./CompanyDrawer";
import type { CompanyRowDTO } from "../dto";
import { Badge } from "@/components/ui/badge";
import { SortableHead } from "./CompanyTable/SortableHead";
import { useSearchParams, useRouter } from "next/navigation";

type Props = {
  companies: CompanyRowDTO[];
  page: number;
  totalPages: number;
};
export function CompanyTable({ companies, page, totalPages }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // state só serve pra clique do usuário (quando você quiser forçar abrir algo)
  const [selectedCnpj, setSelectedCnpj] = useState<string | null>(null);

  const cnpjFromUrl = searchParams.get("cnpj");

  const selected = selectedCnpj ?? cnpjFromUrl;

  function setCnpjInUrl(cnpj: string | null) {
    const params = new URLSearchParams(searchParams.toString());

    if (cnpj) params.set("cnpj", cnpj);
    else params.delete("cnpj");

    router.replace(`?${params.toString()}`);
  }

  function handleSelectCompany(cnpj: string) {
    setSelectedCnpj(cnpj);      // abre imediatamente
    setCnpjInUrl(cnpj);         // sincroniza na URL
  }

  function handleCloseDrawer() {
    setSelectedCnpj(null);      // limpa clique manual
    setCnpjInUrl(null);         // remove da URL
  }


  function goToPage(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));

    router.replace(`?${params.toString()}`, {
      scroll: false,
    });
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <SortableHead label="Razão Social" sortKey="name" />
            <SortableHead label="Honorários" sortKey="paysFees" />
            <SortableHead label="CNPJ" sortKey="cnpj" />
            <TableHead>Regime</TableHead>
            <TableHead>Contador</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {companies.map((company, index) => (
            <TableRow
              key={company.cnpj}
              onClick={() => handleSelectCompany(company.cnpj)}
              className="cursor-pointer hover:bg-muted/50"
            >
              <TableCell>
                {(page - 1) * 10 + index + 1}
              </TableCell>

              <TableCell className="font-medium">
                {company.name ?? "-"}
              </TableCell>

              <TableCell>
                {company.paysFees ? (
                  <Badge className="bg-green-100 text-green-700 border-green-300">
                    Com Honorários
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-700 border-red-300">
                    Sem Honorários
                  </Badge>
                )}
              </TableCell>

              <TableCell className="font-mono text-sm">
                {company.cnpj}
              </TableCell>

              <TableCell>
                {company.taxRegime?.name ?? "-"}
              </TableCell>

              <TableCell>
                {company.accountant ?? "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Paginação */}
      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-muted-foreground">
          Página {page} de {totalPages}
        </span>

        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
            className="px-3 py-1 rounded border text-sm"
          >
            Anterior
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
            className="px-3 py-1 rounded border text-sm"
          >
            Próximo
          </button>
        </div>
      </div>

      {/* Drawer */}
      {selected && (
        <CompanyDrawer
          cnpj={selected}
          onClose={handleCloseDrawer}
        />
      )}
    </>
  );
}
