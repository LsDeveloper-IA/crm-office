import type { Prisma } from "@prisma/client";
import type { CompanyRowDTO } from "./company-row.dto";

type CompanyRowEntity = Prisma.CompanyGetPayload<{
  select: {
    cnpj: true;
    name: true;
    profile: {
      select: {
        taxRegime: true;
        accountant: true;
        paysFees: true;
      };
    };
  };
}>;

export function mapCompanyToRowDTO(
  company: CompanyRowEntity
): CompanyRowDTO {
  return {
    cnpj: company.cnpj ?? "",
    name: company.name ?? "",

    taxRegime: company.profile?.taxRegime ?? undefined,
    accountant: company.profile?.accountant ?? "—",
    paysFees: company.profile?.paysFees === true,
  };
}
