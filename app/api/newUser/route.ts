import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isValidEmail } from "@/lib/email";
import { isValidPassword } from "@/lib/password";

type NewUserRequest = {
    name: string;
    username: string;
    password: string;
    role: string;
    active?: boolean;
};

// POST /api/newUser
export async function POST(req: NextRequest) {
    try {
        const body: NewUserRequest = await req.json();
        const emailValid = await isValidEmail(body.username.toString())
        const passwordValid = await isValidPassword(body.password.toString())

        // Verifica se todas as informações foram enviadas com sucesso
        if (!body.name || !body.username || !body.password || !body.role) {
            return NextResponse.json(
                { error: "Campos obrigatórios não informados" },
                { status: 400 }
            );
        }

        if (!emailValid) {
            return NextResponse.json(
                { error: "Email inválido" },
                { status: 400 }
            );
        }

        if (!passwordValid) {
            return NextResponse.json(
                { error: "Senha inválida" },
                { status: 400 }
            );
        }

        const active = Boolean(body.active);
        const name = body.name.toString();
        const email = body.username.toString().trim();
        const password = body.password.toString();
        const role = body.role;
        const saltRounds = 10;


        // await prisma.$transaction(async (tx) => {
        //     await tx.user.upsert({
        //         where: { username: email },
        //         update: {
        //             active: active,
        //             name: name,
        //             role: role,
        //         },
        //         create: {
        //             username: email,
        //             name: name,
        //             password: await bcrypt.hash(password, saltRounds),
        //             role: role,
        //         }
        //     });
        // });

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