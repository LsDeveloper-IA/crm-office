/** JSON persistido no sócio. null mantém o comportamento dos cadastros antigos. */
export function partnerVisibility(periods, year) {
  const months = new Set();
  const yearStart = `${year}-01-01`, yearEnd = `${year}-12-31`;
  if (periods == null) return { visibleMonths: Array.from({ length: 12 }, (_, i) => i), caption: `Resumo anual · ${year}` };
  if (!Array.isArray(periods)) throw new Error('Períodos societários inválidos.');
  let last;
  for (const period of periods) {
    if (!period || typeof period !== 'object') throw new Error('Período societário inválido.');
    const { enteredAt, exitedAt } = period;
    if ((enteredAt && enteredAt > yearEnd) || (exitedAt && exitedAt < yearStart)) continue;
    const start = enteredAt && enteredAt > yearStart ? Number(enteredAt.slice(5, 7)) - 1 : 0;
    const end = exitedAt && exitedAt < yearEnd ? Number(exitedAt.slice(5, 7)) - 1 : 11;
    for (let month = start; month <= end; month++) months.add(month);
    last = period;
  }
  const exit = last?.exitedAt && last.exitedAt <= yearEnd ? last.exitedAt : null;
  return { visibleMonths: [...months].sort((a, b) => a - b), caption: exit ? `Ex sócios · ${exit.split('-').reverse().join('/')}` : `Resumo anual · ${year}` };
}
