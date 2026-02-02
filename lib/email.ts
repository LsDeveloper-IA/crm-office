"use server";

import dns from "dns/promises";
import prisma from "@/lib/prisma";

const blockedDomains = [
    "mailinator.com",
    "10minutemail.com",
    "tempmail.com",
]

async function isValidEmailFormat(email: string): Promise<boolean> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailRegex.test(email)
}

function getDomain(email: string): string {
    return email.split("@")[1];
}

async function hasMxRecord(domain: string): Promise<boolean> {
    try {
        const records = await dns.resolveMx(domain);
        return records.length > 0;
    } catch {
        return false
    }
}


function isDisposableEmail(domain: string): boolean {
    return blockedDomains.includes(domain)
}

// -------------------------------------------------------------------

// Functions Primary
// Verifica se já existe no banco
export async function emailAlreadyExists(email: string): Promise<boolean> {
    const normalizedEmail = email.trim().toLowerCase()

    const user = await prisma.user.findUnique({
        where: {username: normalizedEmail},
        select: {username: true}
    });

    return !!user
}

// Verifica o formato, domínio, etc...
export async function isValidEmail(email: string): Promise<boolean>{
    const normalizedEmail = email.trim().toLowerCase()

    if (!isValidEmailFormat(normalizedEmail)) {
        return false;
    }

    const domain = getDomain(normalizedEmail);

    if(isDisposableEmail(domain)) {
        return false;
    }

    const hasDomain = await hasMxRecord(domain)

    if (!hasDomain) {
        return false;
    }

    return true;
}