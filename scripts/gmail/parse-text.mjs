import { normalizeName, validCnpj } from './data-utils.mjs';

const MONTHS = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3,
  abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9,
  out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
};
const clean = value => value.replace(/\s+/g, ' ').trim();
const pad = number => String(number).padStart(2, '0');

export function extractTextDate(text, { dateHeader, referenceYear } = {}) {
  // Date da API contém o ano real; a aba selecionada não deve substituir esse ano.
  if (dateHeader) {
    const instant = new Date(dateHeader);
    if (Number.isNaN(instant.getTime()) || !/(?:[+-]\d{4}|\b(?:GMT|UTC|UT))\s*(?:\([^)]*\))?$/i.test(dateHeader)) {
      throw new Error('Cabeçalho Date inválido ou sem fuso.');
    }
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(instant);
    const get = type => Number(parts.find(part => part.type === type).value);
    const year = get('year'), month = get('month'), day = get('day');
    return { sentAt: instant.toISOString(), effectiveDate: `${year}-${pad(month)}-${pad(day)}`, year, month, day, source: 'gmail-date' };
  }

  const matches = [...text.matchAll(/^(?:\s*(?:seg|ter|qua|qui|sex|s[áa]b|dom)\.?\s*,?\s*)?(\d{1,2})\s+de\s+([a-zç]+)\.?(?:\s+de\s+(\d{4}))?\s*,?\s*(?:(\d{1,2}):(\d{2}))?\s*$/gim)];
  if (matches.length !== 1) throw new Error('Data textual ausente ou ambígua. Informe o cabeçalho Date do Gmail.');
  const [, d, m, y, hh, mm] = matches[0];
  const year = y ? Number(y) : referenceYear;
  if (!Number.isInteger(year) || year < 2025 || year > 9999) {
    throw new Error('Data sem ano: informe referenceYear explicitamente (2025–9999).');
  }
  const month = MONTHS[normalizeName(m)];
  const day = Number(d), hour = Number(hh ?? 0), minute = Number(mm ?? 0);
  if (!month || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59) {
    throw new Error('Data textual inválida.');
  }
  const effectiveDate = `${year}-${pad(month)}-${pad(day)}`;
  // Texto copiado do Gmail: assume horário de São Paulo, UTC−03 para anos >=2025.
  return {
    sentAt: new Date(`${effectiveDate}T${pad(hour)}:${pad(minute)}:00-03:00`).toISOString(),
    effectiveDate, year, month, day, source: y ? 'text-year' : 'reference-year',
  };
}

/** Apenas texto e Regex: nenhuma dependência de HTML/Cheerio. */
export function parseTextAlteration(text, options = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Corpo textual vazio.');
  // Gmail representa negrito como *texto* na alternativa text/plain.
  const normalized = text.replace(/\r\n?/g, '\n').replace(/[\u00a0\u202f]/g, ' ').replace(/\*/g, '');
  const primaryCompanyMatches = [...clean(normalized).matchAll(/\bda\s+empresa\s*:?\s*(.+?)\s*,?\s*inscrit[ao]\s+n[oa]\s+CNPJ\b/gi)];
let companies = new Set(primaryCompanyMatches.map(match => clean(match[1]).replace(/[,;:\s]+$/, '')));
if (companies.size !== 1) {
  const fallbackMatches = [
    ...clean(normalized).matchAll(/\b(?:da|de)\s+empresa\s*:?\s*(.+?)\s*,?\s*CNPJ\b/gi),
    ...clean(normalized).matchAll(/\bempresa\s*:?\s*(.+?)\s*,?\s*CNPJ\b/gi),
  ];
  const fallbackCompanies = new Set(fallbackMatches.map(match => clean(match[1]).replace(/[,;:\s]+$/, '')
    .replace(/^.*\b(?:da|de)\s+empresa\s*:?\s*/i, '')
    .replace(/^empresa\s*:?\s*/i, '')));
  if (fallbackCompanies.size === 1) companies = fallbackCompanies;
}

  if (companies.size !== 1) throw new Error('Nome da empresa ausente ou ambíguo.');
  const cnpjs = new Set((normalized.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) ?? []).map(value => value.replace(/\D/g, '')));
  if (cnpjs.size !== 1 || !validCnpj([...cnpjs][0])) throw new Error('CNPJ ausente, inválido ou múltiplo.');
  const date = extractTextDate(normalized, options);
  const changes = new Map();
  let action = null, sectionCount = 0;
  const close = () => {
    if (action && !sectionCount) throw new Error('Seção de alteração sem nomes.');
    action = null;
    sectionCount = 0;
  };
  for (const line of normalized.split('\n')) {
    let content = clean(line);
    let closeAfterLine = false;
    if (!content) continue;
    const flag = content.match(/^(SAI|SAEM|ENTRA|ENTRAM|FICA\s+SOMENTE)\s*:\s*(.*)$/i);
    if (flag) {
      close();
      action = /^SA/i.test(flag[1]) ? 'exit' : /^FICA/i.test(flag[1]) ? 'remain' : 'entry';
      content = flag[2];
      if (!content) continue;
      // An explicit action with a same-line name ends before the current-roster list.
      closeAfterLine = true;
    }
    if (!action) continue;
    if (/^(?:\.{3,}|…|\[image:|CONTATO\s*:|PR[ÓO][ -]LABORE\s*:|QSA\s*:|A\s+documenta(?:\u00e7|c)[\u00e3a]o\b|Segue\b|Seguem\b|J[áa] atualizado\b|Desde j[áa]\b|Cordialmente\b|Atenciosamente\b)/i.test(content)) {
      close();
      continue;
    }
    const role = /\s*[-–—]\s*(?:S[ÓO]C(?:IO)?|ADM|REP)(?:\s*\/\s*(?:S[ÓO]C(?:IO)?|ADM|REP))*\s*$/i;
    // Na lista FICA SOMENTE, cargos pertencem ao nome listado e devem ser removidos.
    // Após ENTRA, lista com cargos é o QSA consolidado do template anterior.
    if (action === 'entry' && role.test(content)) { close(); continue; }
    for (const item of content.split(';')) {
      const name = clean(item.replace(/^[-–—•]\s*/, '').replace(role, ''));
      if (!name) continue;
      if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'’\-]*$/u.test(name) || name.split(/\s+/).length < 2) {
        throw new Error('Conteúdo inesperado na seção de sócios.');
      }
      const key = normalizeName(name);
      if (changes.has(key) && changes.get(key).action !== action) throw new Error('Sócio com alterações conflitantes no mesmo e-mail.');
      changes.set(key, { name, action });
      sectionCount++;
    }
    if (closeAfterLine) close();
  }
  close();
  if (!changes.size) throw new Error('Nenhuma seção SAI, ENTRA ou FICA SOMENTE encontrada.');
  return {
    messageId: options.messageId, companyName: [...companies][0], cnpj: [...cnpjs][0],
    sentAt: date.sentAt, effectiveDate: date.effectiveDate, date,
    changes: [...changes.values()],
  };
}
