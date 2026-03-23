"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";

type Row = {
  companyCnpj: string;
  companyName: string;

  partnerId: number;
  partnerName: string;

  participationPercentage?: number | null;
  amount?: number | null;
  status?: string;
  observation?: string;
};

type Props = {
  rows: Row[];
};

export function DistribuicaoTable({ rows }: Props) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>#</TableHead>
          <TableHead>Empresa</TableHead>
          <TableHead>Sócio</TableHead>
          <TableHead>%</TableHead>
          <TableHead>Valor</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Observação</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={`${row.companyCnpj}-${row.partnerId}`}>
            
            <TableCell>
              {index + 1}
            </TableCell>

            <TableCell className="font-medium">
              {row.companyName}
            </TableCell>

            <TableCell>
              {row.partnerName}
            </TableCell>

            <TableCell>
              {row.participationPercentage ?? "-"}
            </TableCell>

            <TableCell>
              {row.amount ?? "-"}
            </TableCell>

            <TableCell>
              {row.status ?? "-"}
            </TableCell>

            <TableCell>
              {row.observation ?? "-"}
            </TableCell>

          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}