import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isValidEmail, emailAlreadyExists } from "@/lib/email";

type NewUserRequest = {
    name: string;
    username: string;
    password: string;
    role: string;
    active?: boolean;
};

// POST /api/user
export async function POST(req: NextRequest) {
    try {
        const body: NewUserRequest = await req.json();
        const emailExists = await emailAlreadyExists(body.username.toString())
        const emailValid = await isValidEmail(body.username.toString())

        // Verifica se todas as informações foram enviadas com sucesso
        if (!body.name || !body.username || !body.password || !body.role) {
            return NextResponse.json(
                { error: "Campos obrigatórios não informados" },
                { status: 400 }
            );
        }

        if (!emailValid && !emailExists) {
            return NextResponse.json(
                { error: "Email inválido" },
                { status: 400 }
            );
        }

        const active = Boolean(body.active);
        const name = body.name.toString();
        const email = body.username.toString().trim();
        const password = body.password.toString();
        const role = body.role;
        const saltRounds = 10;

        await prisma.$transaction(async (tx) => {
            await tx.user.upsert({
                where: { username: email },
                update: {
                    active: active,
                    name: name,
                    role: role,
                    password: await bcrypt.hash(password, saltRounds),
                },
                create: {
                    active: true,
                    username: email,
                    name: name,
                    password: await bcrypt.hash(password, saltRounds),
                    role: role,
                }
            });
        });

        return NextResponse.json({ ok: true});
    }

    catch (err: any) {
        console.error("POST /api/newUser ERROR: ", err);
        return NextResponse.json(
            { error: "Erro interno do servidor" },
            { status: 500 }
        )
    }
}


// GET /api/newUser
export async function GET(req: NextRequest) {
    try {
        const users = await prisma.user.findMany({
            where: {active: true},
            select: {
                name: true,
                password: true,
                username: true,
                role: true,
                active: true,
            }
        })

        return NextResponse.json(users)
    }

    catch (err: any) {
        console.log("GET /api/newUser ERROR: ", err);
        return NextResponse.json(
            { error: "Erro interno do servidor"},
            { status: 500}
        )
    }
}