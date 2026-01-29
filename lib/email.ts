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

async function emailAlreadyExists(email: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
        where: {username: email},
        select: {username: true}
    });

    return !!user
}

function isDisposableEmail(domain: string): boolean {
    return blockedDomains.includes(domain)
}


// Function Primary
export async function isValidEmail(email: string) {
    const domain = getDomain(email);

    if (!isValidEmailFormat(email)) {
        return false;
    }

    if(isDisposableEmail(domain)) {
        return false;
    }

    const hasDomain = await hasMxRecord(domain)

    if (!hasDomain) {
        return false;
    }

    const existsInDb = await emailAlreadyExists(email);

    if (existsInDb) {
        return false;
    }

    return true;
}