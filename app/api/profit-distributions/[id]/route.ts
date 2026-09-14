import { requireDistributionUser } from "@/lib/profit-distribution-auth";
import { isValidDistributionNumber } from "@/lib/profit-distribution-input";
import { isDividendTaxation, type DividendTaxationValue } from "@/lib/dividend-taxation";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getProfitDistributionStatusOrNull } from "@/lib/profit-distribution-status";
import { ProfitDistributionStatus } from "@prisma/client";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _: NextRequest,
  { params }: Params
) {
  const denied = await requireDistributionUser();
  if (denied) return denied;

  const { id } = await params;
  const numericId = Number(id);

  if ((!Number.isSafeInteger(numericId) || numericId <= 0)) {
    return NextResponse.json(
      { error: "Id inválido" },
      { status: 400 }
    );
  }

  try {
    const profitDistribution = await prisma.profitDistribution.findUnique({
      where: { id: numericId },
      include: {
        company: {
          select: {
            cnpj: true,
            name: true,
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!profitDistribution) {
      return NextResponse.json(
        { error: "Registro não encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(profitDistribution);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao buscar registro",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: Params
) {
  const denied = await requireDistributionUser();
  if (denied) return denied;

  const { id } = await params;
  const numericId = Number(id);

  if ((!Number.isSafeInteger(numericId) || numericId <= 0)) {
    return NextResponse.json(
      { error: "Id inválido" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Corpo da requisicao invalido" }, { status: 400 });
    }

    const data: {
      participationPercentage?: number | null;
      amount?: number | null;
      dividendTaxation?: DividendTaxationValue | null;
      status?: ProfitDistributionStatus;
      observation?: string | null;
    } = {};

    if (body.dividendTaxation !== undefined) {
      if (body.dividendTaxation !== null && !isDividendTaxation(body.dividendTaxation)) {
        return NextResponse.json({ error: "Tributação de dividendos inválida" }, { status: 400 });
      }
      data.dividendTaxation = body.dividendTaxation;
    }

    if (body.participationPercentage !== undefined) {
      if (!isValidDistributionNumber(body.participationPercentage, 0, 100)) {
        return NextResponse.json(
          { error: "Percentual inválido" },
          { status: 400 }
        );
      }

      data.participationPercentage = body.participationPercentage == null || body.participationPercentage === "" ? null : Number(body.participationPercentage);
    }

    if (body.amount !== undefined) {
      if (!isValidDistributionNumber(body.amount, -9999999999999.99, 9999999999999.99)) {
        return NextResponse.json(
          { error: "Valor inválido" },
          { status: 400 }
        );
      }

      data.amount = body.amount == null || body.amount === "" ? null : Number(body.amount);
    }

    if (body.status !== undefined) {
      const normalizedStatus = getProfitDistributionStatusOrNull(body.status);

      if (!normalizedStatus) {
        return NextResponse.json(
          { error: "Status inválido" },
          { status: 400 }
        );
      }

      data.status = normalizedStatus;
    }

    if (body.observation !== undefined) {
      data.observation =
        body.observation && String(body.observation).trim() !== ""
          ? String(body.observation).trim()
          : null;
    }

    const updated = await prisma.profitDistribution.update({
      where: { id: numericId },
      data,
      include: {
        company: {
          select: {
            cnpj: true,
            name: true,
          },
        },
        partner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(updated);

  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao atualizar registro",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _: NextRequest,
  { params }: Params
) {
  const denied = await requireDistributionUser();
  if (denied) return denied;

  const { id } = await params;
  const numericId = Number(id);

  if ((!Number.isSafeInteger(numericId) || numericId <= 0)) {
    return NextResponse.json(
      { error: "Id inválido" },
      { status: 400 }
    );
  }

  try {
    await prisma.profitDistribution.delete({
      where: { id: numericId },
    });

    return NextResponse.json({ success: true });

  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao excluir registro",
      },
      { status: 500 }
    );
  }
}
