export function normalizeCNPJ(cnpj: string) {
  return cnpj.replace(/\D/g, "");
}

export function isValidCNPJ(cnpj: string) {
  const value = normalizeCNPJ(cnpj);
  return value.length === 14;
}

export function validateCNPJ(cnpj: string) {
    const cnpjNormalized = normalizeCNPJ(cnpj as string);
    let cnpjParsed = cnpjNormalized.slice(0, 12);
    let cnpjVerification: string | number[] = cnpjNormalized.split('').map(Number);   
    const verificationOne = [5,4,3,2,9,8,7,6,5,4,3,2];
    const verificationTwo = [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const cnpjCalcOne = [];
    const cnpjCalcTwo = [];
    let checkerOne = 0;
    let checkerTwo = 0;
    let total = 0;

    // Primeira Parte da Verificação
    for (let i = 0; i < verificationOne.length; i++) {
      let number = cnpjVerification[i] * verificationOne[i];
      cnpjCalcOne.push(number);
    }

    for (let i of cnpjCalcOne) {
      total += i;
    }

    total % 11 < 2 ? checkerOne = 0 : checkerOne = 11 - (total % 11);
    cnpjParsed += checkerOne.toString();
    total = 0;

    // Segundo Parte da Verificação
    for (let i = 0; i < verificationTwo.length; i++) {
      let number = cnpjVerification[i] * verificationTwo[i];
      cnpjCalcTwo.push(number);
    }

    for (let i of cnpjCalcTwo) {
      total += i;
    }

    total % 11 < 2 ? checkerTwo = 0 : checkerTwo = 11 - (total % 11);
    cnpjParsed += checkerTwo.toString();

    return cnpjParsed === cnpjNormalized;
  }
