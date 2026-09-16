import test from 'node:test';
import assert from 'node:assert/strict';
import { PrismaCRM } from '../scripts/gmail/prisma-crm.mjs';
import { partnerVisibility } from '../lib/partner-periods.mjs';

function database(initial = []) {
  let state = { partners: initial, imports: [] };
  let companyExists = true;
  return {
    get state() { return state; },
    set companyExists(value) { companyExists = value; },
    async $transaction(fn) {
      const staged = structuredClone(state);
      const result = await fn({
        $executeRaw: async () => 1,
        company: { findFirst: async () => companyExists ? { cnpj: '11222333000181' } : null },
        profitPartner: {
          findMany: async () => [...staged.partners],
          create: async ({ data }) => { const row = { id: staged.partners.length + 1, ...data }; staged.partners.push(row); return row; },
          update: async ({ where, data }) => { Object.assign(staged.partners.find(p => p.id === where.id), data); },
        },
        gmailQsaImport: {
          findUnique: async ({ where }) => staged.imports.find(i => i.mailbox === where.mailbox_messageId.mailbox && i.messageId === where.mailbox_messageId.messageId),
          create: async ({ data }) => staged.imports.push(data),
          findMany: async () => staged.imports,
        },
      });
      state = staged;
      return result;
    },
  };
}
const alteration = (changes, messageId = 'm1', effectiveDate = '2026-08-27') => ({
  cnpj: '11222333000181', companyName: 'Empresa', messageId, effectiveDate,
  sentAt: `${effectiveDate}T15:00:00.000Z`, changes,
});

test('database adapter creates entry/history, persists periods and skips repeated email', async () => {
  const db = database();
  const crm = new PrismaCRM(db);
  const message = alteration([{ name: 'Ana Silva', action: 'entry' }, { name: 'Bruno Souza', action: 'exit' }]);
  await crm.updateCompanyInCRM('mailbox', message);
  assert.equal(db.state.partners.length, 2);
  assert.deepEqual(partnerVisibility(db.state.partners[0].qsaPeriods, 2026).visibleMonths, [7, 8, 9, 10, 11]);
  assert.equal(partnerVisibility(db.state.partners[1].qsaPeriods, 2026).caption, 'Ex sócios · 27/08/2026');
  assert.equal((await crm.updateCompanyInCRM('mailbox', message)).duplicate, true);
  assert.equal(db.state.imports.length, 1);
});

test('database adapter preserves prior membership and replays delayed messages', async () => {
  const db = database([{ id: 1, name: 'Ana Silva', knownBeforeGmail: true }]);
  const crm = new PrismaCRM(db);
  await crm.updateCompanyInCRM('mailbox', alteration([{ name: 'ANA SILVA', action: 'remain' }]));
  assert.equal(db.state.partners[0].qsaPeriods[0].enteredAt, null);
  await crm.updateCompanyInCRM('mailbox', alteration([{ name: 'Ana Silva', action: 'entry' }], 'older', '2026-04-01'));
  assert.equal(db.state.partners[0].qsaPeriods[0].enteredAt, '2026-04-01');
  assert.equal(db.state.partners.length, 1);
});

test('conflicts roll back all partners and the import marker; unmatched company stays untouched', async () => {
  const db = database();
  const crm = new PrismaCRM(db);
  await crm.updateCompanyInCRM('mailbox', alteration([{ name: 'Ana Silva', action: 'entry' }]));
  await assert.rejects(crm.updateCompanyInCRM('mailbox', alteration([
    { name: 'Novo Socio', action: 'entry' }, { name: 'Ana Silva', action: 'entry' },
  ], 'bad', '2026-09-01')));
  assert.equal(db.state.partners.length, 1);
  assert.equal(db.state.imports.length, 1);
  db.companyExists = false;
  await assert.rejects(crm.updateCompanyInCRM('mailbox', alteration([{ name: 'Novo Socio', action: 'entry' }], 'missing')), /não cadastrada/);
  assert.equal(db.state.imports.length, 1);
});

test('annual projection keeps legacy months and excludes gaps between memberships', () => {
  assert.equal(partnerVisibility(null, 2026).visibleMonths.length, 12);
  const periods = [{ enteredAt: null, exitedAt: '2026-02-01' }, { enteredAt: '2026-08-01', exitedAt: null }];
  assert.deepEqual(partnerVisibility(periods, 2026).visibleMonths, [0, 1, 7, 8, 9, 10, 11]);
  assert.deepEqual(partnerVisibility([{ enteredAt: null, exitedAt: '2025-12-31' }], 2026).visibleMonths, []);
});
