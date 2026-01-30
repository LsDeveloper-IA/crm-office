"use server";

export async function isValidPassword(password: string): Promise<boolean> {
    if (password.length < 8) return false;

    const hasNumber = /\d/.test(password)
    const hasUpperCase = /[A-Z]/.test(password)
    const hasLowerCase = /[a-z]/.test(password)
    const hasEspecialCharacter = /[^a-zA-z0-9]/.test(password)

    return (hasNumber && hasUpperCase && hasLowerCase && hasEspecialCharacter);
}