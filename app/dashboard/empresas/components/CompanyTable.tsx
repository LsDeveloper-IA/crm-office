"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import Link from "next/link";

type Props = {
  companies: CompanyRowDTO[];
  page: number;
  totalPages: number;
};

export function CompanyTable({ companies, page, totalPages }: Props) {
  const [selectedCnpj, setSelectedCnpj] =
    useState<string | null>(null);

  const router = useRouter();

  function goToPage(p: number) {
    router.replace(`/dashboard/empresas?page=${p}`, {
      scroll: false,
    });
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Razão Social</TableHead>
            <TableHead>CNPJ</TableHead>
            <TableHead>Regime</TableHead>
            <TableHead>Contador</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {companies.map((company, index) => (
            <TableRow
              key={company.cnpj}
              onClick={() => setSelectedCnpj(company.cnpj)}
              className="cursor-pointer hover:bg-muted/50"
            >
              <TableCell>
                {(page - 1) * 10 + index + 1}
              </TableCell>

              <TableCell className="font-medium">
                {company.name ?? "-"}
              </TableCell>

              <TableCell className="font-mono text-sm">
                {company.cnpj}
              </TableCell>

              <TableCell>
                {company.taxRegime ?? "-"}
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
          <Link
            href={`?page=${page - 1}`}
            aria-disabled={page <= 1}
            className={`px-3 py-1 rounded border text-sm
              ${page <= 1 ? "pointer-events-none opacity-50" : "hover:bg-muted"}
            `}
          >
            Anterior
          </Link>

          <Link
            href={`?page=${page + 1}`}
            aria-disabled={page >= totalPages}
            className={`px-3 py-1 rounded border text-sm
              ${page >= totalPages ? "pointer-events-none opacity-50" : "hover:bg-muted"}
            `}
          >
            Próximo
          </Link>
        </div>
      </div>

      {/* Drawer */}
      <CompanyDrawer
        cnpj={selectedCnpj}
        onClose={() => setSelectedCnpj(null)}
      />
    </>
  );
}