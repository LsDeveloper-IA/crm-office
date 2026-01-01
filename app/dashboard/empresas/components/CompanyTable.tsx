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

type Props = {
  companies: CompanyRowDTO[];
};

export function CompanyTable({ companies }: Props) {
  const [selectedCnpj, setSelectedCnpj] = useState<string | null>(null);

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
              className="cursor-pointer hovern hover:bg-muted/50"
            >
              <TableCell>{index + 1}</TableCell>

              <TableCell className="font-medium">
                {company.name ?? "-"}
              </TableCell>

              <TableCell className="font-mono text-sm">
                {company.cnpj}
              </TableCell>

              <TableCell>
                {company.profile?.taxRegime ?? "-"}
              </TableCell>

              <TableCell>
                {company.profile?.accountant ?? "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <CompanyDrawer
        cnpj={selectedCnpj}
        onClose={() => setSelectedCnpj(null)}
      />
    </>
  );
}