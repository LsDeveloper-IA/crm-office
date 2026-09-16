const clean = text => text.replace(/\s+/g, ' ').trim();

/** Preserva quebras visuais e a cor de cada trecho, mesmo com <b>/<span> aninhados. */
export function htmlLines($, actionForNode) {
  const lines = [];
  let parts = [];
  const flush = () => {
    if (clean(parts.map(part => part.text).join(''))) lines.push(parts);
    parts = [];
  };
  function visit(node) {
    if (node.type === 'text') {
      parts.push({ text: node.data, action: actionForNode(node) });
      return;
    }
    const block = /^(?:p|div|tr|td|li|ul|ol|h[1-6])$/.test(node.name ?? '');
    if (block || node.name === 'br') flush();
    for (const child of node.children ?? []) visit(child);
    if (block) flush();
  }
  visit($('body')[0]);
  flush();
  return lines;
}

export function officeCompanyName(text) {
  const matches = [...text.matchAll(/\bda\s+empresa\s*:?\s*(.+?)\s*,?\s*inscrit[ao]\s+n[oa]\s+CNPJ\b/gi)];
  return [...new Set(matches.map(match => clean(match[1]).replace(/[,;:\s]+$/, '')).filter(Boolean))];
}

/** As seções explícitas delimitam alterações; cargos/lista final e assinatura encerram a seção. */
export function officeChanges(lines) {
  const changes = [];
  let action = null;
  let count = 0;
  const close = () => {
    if (action && count === 0) throw new Error('Seção SAI/ENTRA sem nomes; revisão necessária.');
    action = null;
    count = 0;
  };
  for (const parts of lines) {
    let text = clean(parts.map(part => part.text).join(''));
    const heading = text.match(/^(SAI|ENTRA)\s*:\s*(.*)$/i);
    if (heading) {
      close();
      action = heading[1].toUpperCase() === 'SAI' ? 'exit' : 'entry';
      text = heading[2];
      if (!text) continue;
    }
    if (!action) continue;
    // Lista consolidada não representa entradas. Não importar seus cargos como nomes.
    if (/\s[-–—]\s*(?:S[ÓO]C|ADM|REP)\b/i.test(text)
      || /^(?:QSA|QUADRO SOCIET[ÁA]RIO|S[ÓO]CIOS ATUAIS)\s*:?$/i.test(text)
      || /^(?:Segue\b|Seguem\b|J[áa] atualizado\b|Desde j[áa]\b|Cordialmente\b|Atenciosamente\b)/i.test(text)) {
      close();
      continue;
    }
    const colors = new Set(parts.filter(part => part.text.trim() && part.action).map(part => part.action));
    if ([...colors].some(colorAction => colorAction !== action)) {
      throw new Error('Cor do texto contradiz a seção SAI/ENTRA; revisão necessária.');
    }
    for (const value of text.split(';')) {
      const name = clean(value).replace(/^[-–—•]\s*/, '').replace(/[,;]+$/, '').trim();
      if (!name) continue;
      if (!/^[\p{L}\p{M}][\p{L}\p{M}\s.'’\-]*$/u.test(name) || name.split(/\s+/).length < 2) {
        throw new Error('Conteúdo inesperado na seção SAI/ENTRA; revisão necessária.');
      }
      changes.push({ name, action });
      count++;
    }
  }
  close();
  if (!changes.length) throw new Error('Seções SAI/ENTRA não encontradas; ajuste partnerSelector para este template.');
  return changes;
}
