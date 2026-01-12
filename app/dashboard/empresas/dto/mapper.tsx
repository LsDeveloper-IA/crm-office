// app/dashboard/empresas/dto/mapper.ts
import type { CompanyRowDTO } from "./company-row.dto";

export function mapCompanyToRowDTO(company: any): CompanyRowDTO {
  return {
    cnpj: company.cnpj,
    name: company.name,

    taxRegime: company.profile?.taxRegime ?? "—",
    accountant: company.profile?.accountant ?? "—",
  };
}