import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isValidEmail } from "@/lib/email";
import { isValidPassword } from "@/lib/password";


// POST /api/newUser
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const name = body.name.toString().trim();
        const email = body.username.toString().trim();
        const password = body.password.toString();

        if (!isValidEmail(email)) {
            return NextResponse.json(
                { error: "Email inválido" },
                { status: 400 }
            );
        }

        if (!isValidPassword(password)) {
            return NextResponse.json(
                { error: "Senha inválida" },
                { status: 400 }
            )
        }

        await prisma.$transaction(async (tx) => {
            await tx.user.upsert({
                where: { username: email },
                update: {},
                create: {
                    username: email,
                    name: name,
                    password: password,
                }
            });
        });

        return NextResponse.json({ ok: true});
    }

    catch (err: any) {
        console.error("POST /api/newUser ERROR: ", err);
    }
}   