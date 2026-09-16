import { load } from 'cheerio';
import { header } from './gmail.mjs';
import { htmlLines, officeChanges, officeCompanyName } from './office-template.mjs';

import { normalizeName, validCnpj } from "./data-utils.mjs";
export { normalizeName, validCnpj } from "./data-utils.mjs";
const clean = value => value.replace(/\s+/g, ' ').trim();
const COLORS = {
  green: 'entry', lime: 'entry', '#008000': 'entry', '#00ff00': 'entry', '#00b050': 'entry', '#008000ff': 'entry',
  red: 'exit', '#ff0000': 'exit', '#c00000': 'exit', '#ff0000ff': 'exit',
};

function normalizeColor(value) {
  let color = value.toLowerCase().replace(/\s*!important\s*$/, '').replace(/\s+/g, '');
  if (/^#[0-9a-f]{3}$/.test(color)) color = '#' + [...color.slice(1)].map(c => c + c).join('');
  const rgb = color.match(/^rgba?\((\d+),(\d+),(\d+)(?:,(1|1\.0+))?\)$/);
  if (rgb && rgb.slice(1, 4).every(c => Number(c) <= 255)) {
    color = '#' + rgb.slice(1, 4).map(c => Number(c).toString(16).padStart(2, '0')).join('');
  }
  return color;
}

export function parseSentDate(message, timeZone = 'America/Sao_Paulo') {
  // internalDate representa recebimento no Gmail; não substituir silenciosamente Date.
  const raw = header(message, 'Date');
  if (!raw || !/(?:[+-]\d{4}|\b(?:GMT|UTC|UT))\s*(?:\([^)]*\))?$/i.test(raw)) {
    throw new Error('Data de envio ausente ou sem fuso explícito.');
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error('Data de envio inválida.');
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  return { sentAt: date.toISOString(), effectiveDate: `${get('year')}-${get('month')}-${get('day')}` };
}

/**
 * Contrato do template: nome da empresa em [data-company-name] ou .empresa;
 * nome de cada sócio em [data-partner-name] ou .socio-nome.
 * Ajuste os seletores ao HTML real. Nunca classifique assinaturas/legendas como sócios.
 */
export function parseAlteration(message, html, config = {}) {
  const $ = load(html);
  $('blockquote, .gmail_quote, .gmail_signature, script').remove();
  if ($('style').text().match(/\bcolor\s*:/i) || $('link[rel="stylesheet"]').length) {
    throw new Error('Template usa CSS externo/em bloco. Adapte a resolução de estilos antes de importar.');
  }
  $('style').remove();
  const companySelector = config.companySelector ?? '[data-company-name], .empresa';
  const partnerSelector = config.partnerSelector ?? '[data-partner-name], .socio-nome';
  let names = new Set($(companySelector).toArray().map(el => clean($(el).text())).filter(Boolean));
  const bodyText = $('body').clone();
  bodyText.find('br').replaceWith(' ');
  bodyText.find('p, div, tr, td, li').prepend(' ').append(' ');
  if (!names.size) names = new Set(officeCompanyName(clean(bodyText.text())));
  if (names.size !== 1) throw new Error('Nome da empresa ausente ou ambíguo; ajuste companySelector.');
  const candidates = bodyText.text().match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) ?? [];
  const cnpjs = new Set(candidates.map(c => c.replace(/\D/g, '')));
  if (cnpjs.size !== 1 || !validCnpj([...cnpjs][0])) throw new Error('CNPJ ausente, inválido ou múltiplo.');
  const colors = { ...COLORS, ...config.colors };
  function actionForNode(node) {
    for (let parent = node.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      const style = $(parent).attr('style') ?? '';
      const declarations = [...style.matchAll(/(?:^|;)\s*color\s*:\s*([^;]+)/gi)];
      const value = declarations.at(-1)?.[1] ?? $(parent).attr('color');
      if (value) {
        if (value.trim().toLowerCase() === 'inherit') continue;
        return colors[normalizeColor(value)];
      }
    }
  }
  const changes = new Map();
  function addChange(name, action) {
    const key = normalizeName(name);
    if (changes.has(key) && changes.get(key).action !== action) throw new Error('Mesmo sócio entrou e saiu no mesmo e-mail.');
    changes.set(key, { name, action });
  }
  for (const element of $(partnerSelector).toArray()) {
    if ($(element).find(partnerSelector).length) continue;
    const name = clean($(element).text());
    if (name.length < 2) throw new Error('Nome de sócio inválido.');
    const actions = new Set();
    function visit(node) {
      if (node.type === 'text' && node.data.trim()) {
        const action = actionForNode(node);
        if (action !== 'entry' && action !== 'exit') throw new Error('Cor de sócio ausente ou não reconhecida.');
        actions.add(action);
      }
      for (const child of node.children ?? []) visit(child);
    }
    visit(element);
    if (actions.size !== 1) throw new Error('Nome com cores conflitantes.');
    const action = [...actions][0];
    addChange(name, action);
  }
  if (!changes.size) {
    for (const change of officeChanges(htmlLines($, actionForNode))) addChange(change.name, change.action);
  }
  if (!changes.size) throw new Error('Nenhum sócio encontrado; ajuste partnerSelector.');
  return {
    messageId: message.id, ...parseSentDate(message, config.timeZone),
    companyName: [...names][0], cnpj: [...cnpjs][0], changes: [...changes.values()],
  };
}
