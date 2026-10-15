import { normalizeName } from './data-utils.mjs';

/** Meses 0–11, compatíveis com DistribuicaoTable. Limites inclusivos. */
export function visibleMonths(periods, year = 2026) {
  if (!Number.isInteger(year)) throw new Error('Ano inválido.');
  const startOfYear = `${year}-01-01`;
  const endOfYear = `${year}-12-31`;
  const result = new Set();
  for (const { enteredAt, exitedAt } of periods) {
    if (enteredAt && exitedAt && enteredAt > exitedAt) throw new Error('Saída anterior à entrada.');
    if (enteredAt && enteredAt > endOfYear || exitedAt && exitedAt < startOfYear) continue;
    const start = enteredAt && enteredAt > startOfYear ? Number(enteredAt.slice(5, 7)) - 1 : 0;
    const end = exitedAt && exitedAt < endOfYear ? Number(exitedAt.slice(5, 7)) - 1 : 11;
    for (let month = start; month <= end; month++) result.add(month);
  }
  return [...result].sort((a, b) => a - b);
}

export function projectPartner(events, year = 2026, knownBefore = false) {
  const periods = [];
  const ordered = [...events].sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.messageId.localeCompare(b.messageId));
  if (knownBefore && ordered[0]?.action === 'remain') periods.push({ enteredAt: null, exitedAt: null });
  for (const event of ordered) {
    const current = periods.at(-1);
    if (event.action === 'entry') {
      if (current && !current.exitedAt) throw new Error('Entrada repetida sem saída intermediária: revisar histórico.');
      periods.push({ enteredAt: event.effectiveDate, exitedAt: null });
    } else if (event.action === 'remain') {
      // Permanência não reinicia um vínculo conhecido. Sem cadastro, inicia no e-mail.
      if (!current || current.exitedAt) periods.push({ enteredAt: event.effectiveDate, exitedAt: null });
    } else if (event.action === 'exit') {
      if (current?.exitedAt) throw new Error('Saída repetida sem nova entrada: revisar histórico.');
      if (current) current.exitedAt = event.effectiveDate;
      else periods.push({ enteredAt: null, exitedAt: event.effectiveDate }); // Histórico sem entrada conhecida.
    } else throw new Error('Tipo de alteração inválido.');
  }
  const months = visibleMonths(periods, year);
  const yearEnd = `${year}-12-31`;
  const relevant = periods.filter(p => (!p.enteredAt || p.enteredAt <= yearEnd) && (!p.exitedAt || p.exitedAt >= `${year}-01-01`));
  const last = relevant.at(-1);
  const exit = last?.exitedAt && last.exitedAt <= yearEnd ? last.exitedAt : null;
  return {
    name: ordered.at(-1)?.name, periods, visibleMonths: months,
    caption: exit ? `Ex sócios · ${exit.split('-').reverse().join('/')}` : `Sócio ativo · ${year}`,
  };
}

/**
 * MOCK em memória: não altera Prisma. Modelo sugerido para implementação real:
 * - GmailImport UNIQUE(mailboxId, messageId) + eventos imutáveis por sócio;
 * - sócio identificado por empresa + CPF/ID, quando disponível;
 * - transação: verificar importação, inserir eventos, atualizar períodos, marcar importado;
 * - nunca excluir distribuições financeiras de anos anteriores;
 * - ambiguidades de nomes/homônimos exigem conciliação com o cadastro.
 */
export class MockCRM {
  imports = new Map();
  async updateCompanyInCRM(mailboxId, alteration, year = 2026) {
    if (!mailboxId || !alteration.messageId) throw new Error('Mailbox e messageId são obrigatórios para deduplicação.');
    const key = `${mailboxId}:${alteration.messageId}`;
    if (this.imports.has(key)) return { duplicate: true };
    const staged = new Map(this.imports);
    staged.set(key, alteration);
    // Reconstituir cronologicamente permite receber mensagens antigas fora de ordem.
    const partners = new Map();
    for (const item of staged.values()) {
      if (item.cnpj !== alteration.cnpj) continue;
      for (const change of item.changes) {
        const partnerKey = normalizeName(change.name);
        const events = partners.get(partnerKey) ?? [];
        events.push({ ...change, sentAt: item.sentAt, effectiveDate: item.effectiveDate, messageId: item.messageId });
        partners.set(partnerKey, events);
      }
    }
    const result = {
      companyCnpj: alteration.cnpj, companyName: alteration.companyName, year,
      partners: [...partners.values()].map(events => projectPartner(events, year)),
    };
    this.imports = staged; // Commit somente depois de validar toda a mensagem.
    return result;
  }
}
