import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTextAlteration, extractTextDate } from '../scripts/gmail/parse-text.mjs';
import { MockCRM, projectPartner } from '../scripts/gmail/crm.mjs';
import { getTextBody } from '../scripts/gmail/gmail.mjs';

const text = `Financeiro Office Contábil
qui., 27 de ago., 15:49
Boa tarde, foi realizado um processo de ALTERAÇÃO DE QSA da empresa SOARES-FERREIRA CONSULTORIA AMBIENTAL LTDA, inscrita no CNPJ sob Nº 30.879.596/0001-02
QSA:
SAI:  GABRIEL DOS SANTOS FERREIRA
FICA SOMENTE :
DIEGO DE OLIVEIRA SOARES   - SÓC/ADM/REP
...
Segue anexo documentação.
Cordialmente, Débora Araújo`;

test('real text template: company, CNPJ, Portuguese date, exit and remaining partner', () => {
  const result = parseTextAlteration(text, { referenceYear: 2026, messageId: 'm1' });
  assert.equal(result.companyName, 'SOARES-FERREIRA CONSULTORIA AMBIENTAL LTDA');
  assert.equal(result.cnpj, '30879596000102');
  assert.equal(result.effectiveDate, '2026-08-27');
  assert.equal(result.date.month, 8);
  assert.equal(result.date.source, 'reference-year');
  assert.deepEqual(result.changes, [
    { name: 'GABRIEL DOS SANTOS FERREIRA', action: 'exit' },
    { name: 'DIEGO DE OLIVEIRA SOARES', action: 'remain' },
  ]);
});

test('Gmail bold markers, list bullets and contact footer do not become partner names', () => {
  const actual = text.replace('SAI:', '*SAI: *')
    .replace('SOARES-FERREIRA CONSULTORIA AMBIENTAL LTDA,', '*SOARES-FERREIRA\nCONSULTORIA AMBIENTAL LTDA, *')
    .replace('DIEGO DE OLIVEIRA SOARES   - SÓC/ADM/REP', '   - DIEGO DE OLIVEIRA SOARES *- *SÓC/ADM/REP')
    .replace('...', '[image: image.png]\n*CONTATO:*\n*DIEGO DE OLIVEIRA*\nEMAIL: exemplo@example.com');
  const result = parseTextAlteration(actual, { referenceYear: 2026 });
  assert.equal(result.changes.length, 2);
  assert.equal(result.companyName, 'SOARES-FERREIRA CONSULTORIA AMBIENTAL LTDA');
});

test('unknown year is never guessed; Date header takes precedence; invalid calendar dates fail', () => {
  assert.throws(() => parseTextAlteration(text), /referenceYear/);
  assert.equal(parseTextAlteration(text, { referenceYear: 2026, dateHeader: 'Wed, 27 Aug 2025 15:49:00 -0300' }).date.year, 2025);
  assert.equal(extractTextDate('27 de agosto de 2026, 15:49').effectiveDate, '2026-08-27');
  assert.equal(extractTextDate('01 de março de 2026').month, 3);
  assert.throws(() => extractTextDate('31 de fev., 15:49', { referenceYear: 2026 }), /inválida/);
  assert.throws(() => extractTextDate('27 de ago., 25:49', { referenceYear: 2026 }), /inválida/);
});

test('text whitespace, accents, semicolons, roles and duplicate names are normalized', () => {
  const result = parseTextAlteration(text.replace('DIEGO DE OLIVEIRA SOARES   - SÓC/ADM/REP',
    '• DIEGO DE OLIVEIRA SOARES - SOC/ADM;\nDIEGO DE OLIVEIRA SOARES - SÓC/ADM/REP').replaceAll(' ', '\u00a0'), { referenceYear: 2026 });
  assert.equal(result.changes.length, 2);
  assert.throws(() => parseTextAlteration(text.replace('DIEGO DE OLIVEIRA SOARES', 'GABRIEL DOS SANTOS FERREIRA'), { referenceYear: 2026 }), /conflitantes/);
});

test('business rules create historical exit and unknown remaining partner with inclusive months', async () => {
  const crm = new MockCRM();
  const alteration = parseTextAlteration(text, { referenceYear: 2026, messageId: 'm1' });
  const result = await crm.updateCompanyInCRM('mailbox', alteration, 2026);
  const [exPartner, remaining] = result.partners;
  assert.equal(exPartner.caption, 'Ex sócios · 27/08/2026');
  assert.deepEqual(exPartner.visibleMonths, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(remaining.visibleMonths, [7, 8, 9, 10, 11]);
  assert.deepEqual(await crm.updateCompanyInCRM('mailbox', alteration), { duplicate: true });
  const nextYear = projectPartner([{ ...alteration, ...alteration.changes[0] }], 2027);
  assert.deepEqual(nextYear.visibleMonths, []);
});

test('FICA SOMENTE preserves existing entry date, including imported older events', async () => {
  const crm = new MockCRM();
  const later = parseTextAlteration(text, { referenceYear: 2026, messageId: 'later' });
  await crm.updateCompanyInCRM('mailbox', later);
  const earlier = {
    ...later, messageId: 'earlier', sentAt: '2025-01-01T12:00:00.000Z', effectiveDate: '2025-01-01',
    changes: [{ name: 'DIEGO DE OLIVEIRA SOARES', action: 'entry' }]
  };
  const result = await crm.updateCompanyInCRM('mailbox', earlier);
  const diego = result.partners.find(p => p.name === 'DIEGO DE OLIVEIRA SOARES');
  assert.equal(diego.periods[0].enteredAt, '2025-01-01');
  assert.equal(diego.visibleMonths.length, 12);
});

test('Gmail plaintext extraction uses text/plain and never parses the HTML alternative', async () => {
  const result = await getTextBody(() => assert.fail(), {
    payload: {
      parts: [
        { mimeType: 'text/html', body: { data: Buffer.from('<p>ignore</p>').toString('base64url') } },
        { mimeType: 'text/plain', body: { data: Buffer.from(text).toString('base64url') } },
      ]
    }
  });
  assert.equal(result, text);
});
