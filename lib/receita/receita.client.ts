// lib/receita/receita.client.ts
import type { ReceitaResponse } from "./receita.types"

export async function fetchCompanyFromReceita(
  cnpj: string
): Promise<ReceitaResponse> {
  const res = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, {
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Erro ao consultar a Receita");
  }

  const data = await res.json();

  if (data.status === "ERROR") {
    throw new Error(data.message || "CNPJ inválido");
  }

  return data;
}