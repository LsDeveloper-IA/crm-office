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
import { Fragment } from "react";

type Company = {
  id: number;
  name: string;
  cnpj: string;
  taxRegime: string;
  accountant: string;
  address?: string;
  sectors: {
    name: string;
    responsible?: { name: string } | null;
  }[];
};

type Props = {
  companies: Company[];
};

export function CompanyTable({ companies }: Props) {
  const [selected, setSelected] = useState<Company | null>(null);

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
            <Fragment key={company.cnpj}>
              <TableRow
              onClick={() => setSelected(company)}
              className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell>{index + 1}</TableCell>
                <TableCell className="font-medium">{company.name}</TableCell>
                <TableCell className="font-mono text-sm">{company.cnpj}</TableCell>
                <TableCell>{company.taxRegime}</TableCell>
                <TableCell>{company.accountant}</TableCell>
              </TableRow>
            </Fragment>
          ))}
        </TableBody>
      </Table>

      <CompanyDrawer
        company={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}