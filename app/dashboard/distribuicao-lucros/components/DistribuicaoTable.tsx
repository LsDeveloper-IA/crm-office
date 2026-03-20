"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

type Company = {
  cnpj: string;
  name: string;
  accountant?: string;
  taxRegime?: string;
};

type Props = {
  companies: Company[];
};
 
export function DistribuicaoTable({ companies }: Props) {
  return (
    <Table>

      <TableHeader>
        <TableRow>
          <TableHead>#</TableHead>
          <TableHead>Empresa</TableHead>
          <TableHead>Sócios</TableHead>
          <TableHead>Percentual de Participação</TableHead>
          <TableHead>Participação de Lucros</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Observações</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {companies.map((company, index) => (
          <TableRow key={company.cnpj}>

            <TableCell>
              {index + 1}
            </TableCell>

            <TableCell className="font-medium">
              {company.name}
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
  );
}