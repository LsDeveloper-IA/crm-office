import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: NextRequest, { params }: Params) {
  const { id } = await params;
  const numericId = Number(id);

  if (Number.isNaN(numericId)) {
    return NextResponse.json(
      { error: "Id invÃ¡lido" },
      { status: 400 }
    );
  }

  try {
    const profitDistribution = await prisma.profitDistribution.findUnique({
      where: {
        id: numericId,
      },
      include: {
        company: {...},
        partner: {
          select: {
            id: true,
            name: true,
          },
        },
      }
    });

    if (!profitDistribution) {
      return NextResponse.json(
        { error: "Registro nÃ£o encontrado" },
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

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const numericId = Number(id);

  if (Number.isNaN(numericId)) {
    return NextResponse.json(
      { error: "Id invÃ¡lido" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();

    const data: {
      participationPercentage?: number;
      amount?: number;
      status?: "NAO_ENCERRADO" | "ENCERRADO_COM_LUCRO" | "ENCERRADO_COM_PREJUIZO";
      observation?: string | null;
    } = {};

    if (body.partnerName !== undefined) {
      const partnerName = String(body.partnerName).trim();

      if (!partnerName) {
        return NextResponse.json(
          { error: "Nome do sÃ³cio invÃ¡lido" },
          { status: 400 }
        );
      }

      data.partnerName = partnerName;
    }

    if (body.participationPercentage !== undefined) {
      if (Number.isNaN(Number(body.participationPercentage))) {
        return NextResponse.json(
          { error: "Percentual de participaÃ§Ã£o invÃ¡lido" },
          { status: 400 }
        );
      }

      data.participationPercentage = Number(body.participationPercentage);
    }

    if (body.amount !== undefined) {
      if (Number.isNaN(Number(body.amount))) {
        return NextResponse.json(
          { error: "Valor invÃ¡lido" },
          { status: 400 }
        );
      }

      data.amount = Number(body.amount);
    }

    if (body.status !== undefined) {
      const allowedStatus = [
        "NAO_ENCERRADO",
        "ENCERRADO_COM_LUCRO",
        "ENCERRADO_COM_PREJUIZO",
      ];

      if (!allowedStatus.includes(body.status)) {
        return NextResponse.json(
          { error: "Status invÃ¡lido" },
          { status: 400 }
        );
      }

      data.status = body.status;
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

export async function DELETE(_: NextRequest, { params }: Params) {
  const { id } = await params;
  const numericId = Number(id);

  if (Number.isNaN(numericId)) {
    return NextResponse.json(
      { error: "Id invÃ¡lido" },
      { status: 400 }
    );
  }

  try {
    await prisma.profitDistribution.delete({
      where: {
        id: numericId,
      },
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
