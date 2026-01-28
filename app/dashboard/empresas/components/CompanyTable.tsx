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
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

type Props = {
  companies: CompanyRowDTO[];
  page: number;
  totalPages: number;
};

export function CompanyTable({ companies, page, totalPages }: Props) {
  const [selectedCnpj, setSelectedCnpj] =
    useState<string | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Razão Social</TableHead>
            <TableHead>Honorários</TableHead>
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
      {selectedCnpj && (
        <CompanyDrawer
          cnpj={selectedCnpj}
          onClose={() => setSelectedCnpj(null)}
        />
      )}
    </>
  );
}