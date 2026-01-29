"use client";

export async function isValidPassword(password: string): Promise<boolean> {
    const hasNumber = password.replace(/\D/g, "");
    const hasUpperCase = password.replace(/[a-z]/g, "").replace(/[1-9]/g, "").replace(/[^a-zA-Z0-9]/g, "")
    const hasLowerCase = password.replace(/[A-Z]/g, "").replace(/[1-9]/g, "").replace(/[^a-zA-Z0-9]/g, "")
    const hasEspecialCharacter = password.replace(/[A-Z]/g, "").replace(/[a-z]/g, "").replace(/[1-9]/g, "")

    if (password.length < 8) {
        return false;
    }

    if(!hasNumber) {
        return false;
    }

    if (!hasUpperCase) {
        return false;
    }

    if (!hasLowerCase) {
        return false;
    }

    if (!hasEspecialCharacter) {
        return false;
    }

    return true;
}