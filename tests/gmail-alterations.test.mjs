import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAlteration, parseSentDate } from '../scripts/gmail/parse.mjs';
import { MockCRM, projectPartner, visibleMonths } from '../scripts/gmail/crm.mjs';
import { credentials, exchangeToken, SCOPE, TOKEN_FILE, createGmailClient, header, getHtmlBody, listAlterationMessages } from '../scripts/gmail/gmail.mjs';

const message = { id: 'm1', payload: { headers: [{ name: 'Date', value: 'Wed, 01 Apr 2026 01:00:00 +0000' }] } };
const html = `<div class="empresa">Empresa Exemplo</div><p>CNPJ: 11.222.333/0001-81</p>
  <p style="color: rgb(0, 176, 80)"><span class="socio-nome"><b>Ana</b> Silva</span></p>
  <font color="#f00"><span class="socio-nome">Bruno Souza</span></font>`;
const event = (action, date, id = date) => ({ action, name: 'Ana Silva', effectiveDate: date, sentAt: `${date}T15:00:00.000Z`, messageId: id });
const officeHtml = readFileSync(new URL('./fixtures/gmail-office-qsa.html', import.meta.url), 'utf8');

test('Office QSA template extracts the company, one exit and seven entries without full roster duplicates', () => {
  const result = parseAlteration(message, officeHtml);
  assert.equal(result.companyName, 'MEFICLINIC MEDICINA E FISIOTERAPIA INTEGRADAS LTDA');
  assert.equal(result.cnpj, '04565976000162');
  assert.deepEqual(result.changes.filter(c => c.action === 'exit'), [{ name: 'MARIA RAQUEL MARTINS DA COSTA', action: 'exit' }]);
  assert.equal(result.changes.filter(c => c.action === 'entry').length, 7);
  assert.equal(result.changes.filter(c => c.name === 'FRANCISCO MARDONIO SALMITO DE ALMEIDA').length, 1);
  assert.ok(result.changes.some(c => c.name === 'MARIA DE FÁTIMA RICARTE MONTEIRO MACHADO'));
  assert.ok(!result.changes.some(c => /MARLEDA|DANIELLE|LUANA|Débora/.test(c.name)));
});

test('explicit SAI/ENTRA sections work without colors but reject contradictory colors', () => {
  assert.equal(parseAlteration(message, officeHtml.replace(/ style="[^"]*"/g, '')).changes.length, 8);
  assert.throws(() => parseAlteration(message, officeHtml.replace('color: red', 'color: green')), /contradiz/);
  assert.throws(() => parseAlteration(message, officeHtml.replace('ENTRA:</b>', 'ENTRA:</b></div><div>SAI:</div><div>')), /sem nomes/);
});

test('section names separated by semicolon are deduplicated and footer terminates parsing', () => {
  const compact = `<p>da empresa <b>Empresa Exemplo</b>, inscrita no CNPJ 11.222.333/0001-81</p>
    <p>ENTRA: Ana Silva; Bruno Souza; Ana Silva;</p>
    <p>Segue anexo documentação.</p><p>Débora Araújo</p>`;
  assert.deepEqual(parseAlteration(message, compact).changes, [{ name: 'Ana Silva', action: 'entry' }, { name: 'Bruno Souza', action: 'entry' }]);
});

test('Gmail exports required by authorization, parser and sync remain available', () => {
  assert.equal(SCOPE, 'https://www.googleapis.com/auth/gmail.readonly');
  assert.match(TOKEN_FILE, /gmail-token\.json$/);
  assert.equal(typeof createGmailClient, 'function');
  assert.equal(header(message, 'date'), 'Wed, 01 Apr 2026 01:00:00 +0000');
});

test('OAuth exchanges form credentials and reports safe actionable Google errors', async (t) => {
  const previousId = process.env.GMAIL_CLIENT_ID;
  const previousSecret = process.env.GMAIL_CLIENT_SECRET;
  t.after(() => {
    if (previousId === undefined) delete process.env.GMAIL_CLIENT_ID;
    else process.env.GMAIL_CLIENT_ID = previousId;
    if (previousSecret === undefined) delete process.env.GMAIL_CLIENT_SECRET;
    else process.env.GMAIL_CLIENT_SECRET = previousSecret;
  });
  process.env.GMAIL_CLIENT_ID = ' test-client ';
  process.env.GMAIL_CLIENT_SECRET = ' test-secret ';
  assert.equal(credentials().client_id, 'test-client');
  let response = { status: 200, body: { access_token: 'test-access', expires_in: 3600 } };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://oauth2.googleapis.com/token');
    assert.equal(options.body.get('client_secret'), 'test-secret');
    assert.equal(options.body.get('code_verifier'), 'test-verifier');
    assert.ok(options.signal);
    return new Response(JSON.stringify(response.body), { status: response.status });
  });
  const params = { code: 'test-code', code_verifier: 'test-verifier', grant_type: 'authorization_code' };
  assert.equal((await exchangeToken(params)).access_token, 'test-access');
  response = { status: 400, body: { error: 'invalid_grant', error_description: 'sensitive-value' } };
  await assert.rejects(exchangeToken(params), error => {
    assert.match(error.message, /invalid_grant.*authorize\.mjs/);
    assert.doesNotMatch(error.message, /sensitive-value|test-secret/);
    return true;
  });
  response = { status: 200, body: {} };
  await assert.rejects(exchangeToken(params), /resposta de token inválida/);
  delete process.env.GMAIL_CLIENT_ID;
  assert.throws(credentials, /GMAIL_CLIENT_ID/);
});

test('HTML preserves inherited RGB/hex colors, company, CNPJ and sending date timezone', () => {
  const result = parseAlteration(message, html);
  assert.equal(result.cnpj, '11222333000181');
  assert.equal(result.companyName, 'Empresa Exemplo');
  assert.equal(result.effectiveDate, '2026-03-31');
  assert.deepEqual(result.changes, [{ name: 'Ana Silva', action: 'entry' }, { name: 'Bruno Souza', action: 'exit' }]);
});

test('ambiguous templates, conflicting colors, invalid CNPJ and missing dates require review', () => {
  assert.throws(() => parseAlteration(message, html.replace('#f00', '#000')));
  assert.throws(() => parseAlteration(message, html.replace('0001-81', '0001-82')));
  assert.throws(() => parseAlteration(message, html + '<p>CNPJ 11.222.333/0002-62</p>'));
  assert.throws(() => parseAlteration(message, html.replace('<b>Ana</b>', '<b style="color:red">Ana</b>')));
  assert.throws(() => parseAlteration(message, html + '<style>.socio-nome {color:red}</style>'));
  assert.throws(() => parseSentDate({ payload: { headers: [] }, internalDate: '1770000000000' }));
  assert.equal(parseAlteration(message, html + `<blockquote>${html}</blockquote>`).changes.length, 2);
});

test('inclusive month boundaries, past/future years, historical exits and re-entry', () => {
  assert.deepEqual(visibleMonths([{ enteredAt: '2026-04-30', exitedAt: null }]), [3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(visibleMonths([{ enteredAt: null, exitedAt: '2026-02-01' }]), [0, 1]);
  assert.deepEqual(visibleMonths([{ enteredAt: '2026-08-01', exitedAt: '2026-08-31' }]), [7]);
  assert.deepEqual(visibleMonths([{ enteredAt: null, exitedAt: '2025-12-31' }]), []);
  assert.deepEqual(visibleMonths([{ enteredAt: '2027-01-01', exitedAt: null }]), []);
  const result = projectPartner([event('entry', '2026-08-01'), event('exit', '2026-02-01')]);
  assert.deepEqual(result.visibleMonths, [0, 1, 7, 8, 9, 10, 11]);
  assert.equal(result.caption, 'Resumo anual · 2026');
  assert.equal(projectPartner([event('exit', '2026-08-10')]).caption, 'Ex sócios · 10/08/2026');
  assert.throws(() => projectPartner([event('entry', '2026-01-01'), event('entry', '2026-02-01')]));
});

test('mock imports are idempotent, historical exits create partner and conflicts roll back', async () => {
  const crm = new MockCRM();
  const change = { ...parseAlteration(message, html), changes: [{ name: 'Ana Silva', action: 'exit' }] };
  const result = await crm.updateCompanyInCRM('mailbox', change);
  assert.equal(result.partners[0].caption, 'Ex sócios · 31/03/2026');
  assert.deepEqual(result.partners[0].visibleMonths, [0, 1, 2]);
  assert.deepEqual(await crm.updateCompanyInCRM('mailbox', change), { duplicate: true });
  await assert.rejects(crm.updateCompanyInCRM('mailbox', { ...change, messageId: 'm2' }));
  assert.equal(crm.imports.size, 1);
});

test('Gmail resolves label ID and reads all pages', async () => {
  const ids = await listAlterationMessages(async (path, query) => {
    if (path === 'labels') return { labels: [{ id: 'Label_123', name: 'ALTERAÇÃO' }] };
    assert.equal(query.labelIds, 'Label_123');
    return query.pageToken ? { messages: [{ id: 'b' }] } : { messages: [{ id: 'a' }], nextPageToken: 'page2' };
  });
  assert.deepEqual(ids, ['a', 'b']);
});

test('HTML MIME body supports attachmentId, charset and rejects plaintext-only', async () => {
  const encoded = Buffer.from(html).toString('base64url');
  const multipart = {
    id: 'm1', payload: {
      mimeType: 'multipart/alternative', parts: [
        { mimeType: 'text/plain', body: { data: 'aWdub3Jl' } },
        { mimeType: 'text/html', body: { attachmentId: 'a1' } },
      ]
    }
  };
  const result = await getHtmlBody(async path => {
    assert.equal(path, 'messages/m1/attachments/a1');
    return { data: encoded };
  }, multipart);
  assert.equal(result, html);
  await assert.rejects(getHtmlBody(() => assert.fail(), { payload: { mimeType: 'text/plain', body: { data: 'aGVsbG8' } } }));
});
