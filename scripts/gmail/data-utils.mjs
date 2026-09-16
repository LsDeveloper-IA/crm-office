export const normalizeName = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();

export function validCnpj(value) {
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false;
  const digit = base => {
    let weight = base.length - 7;
    const sum = [...base].reduce((total, c) => {
      const result = total + Number(c) * weight;
      weight = weight === 2 ? 9 : weight - 1;
      return result;
    }, 0);
    return sum % 11 < 2 ? 0 : 11 - sum % 11;
  };
  return digit(value.slice(0, 12)) === Number(value[12]) && digit(value.slice(0, 13)) === Number(value[13]);
}

