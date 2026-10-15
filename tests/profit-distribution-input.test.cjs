const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relativePath, mocks = {}) {
  const context = { exports: {}, console, require: name => {
    assert.ok(name in mocks, `Unexpected import: ${name}`);
    return mocks[name];
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return context.exports;
}
const input = load('lib/profit-distribution-input.ts');

test('percentage validation rejects invalid values and preserves blank versus zero', () => {
  for (const value of [null, undefined, '', 0, 100, 25.5, '25.50']) {
    assert.equal(input.isValidDistributionNumber(value, 0, 100), true);
  }
  for (const value of [-1, 101, Infinity, NaN, 'abc', '1e2', true, [], 1.234]) {
    assert.equal(input.isValidDistributionNumber(value, 0, 100), false);
  }
  const original = { amount: null, status: 'NAO_ENCERRADO' };
  assert.equal(input.hasDistributionChanges({ ...original, amount: 0 }, original), true);
  assert.equal(input.hasDistributionChanges({ ...original, amount: undefined }, original), false);
  assert.equal(input.hasDistributionChanges({ ...original, dividendTaxation: 'ISENTO' }, original), true);
  assert.equal(input.normalizeDistributionSearch('  SÓCIO São José '), 'socio sao jose');
});

test('no-partner placeholder companies appear only in the case-aside filter', () => {
  const placeholder = { partnerId: 12, partnerName: 'Sem sócios' };
  const singularPlaceholder = { partnerId: 14, partnerName: 'Sem sócio' };
  const placeholderId = { partnerId: -999999, partnerName: 'Sem parceiros' };
  const realPartner = { partnerId: 13, partnerName: 'Maria da Silva' };

  assert.equal(input.hasOnlyNoPartnersPlaceholder([placeholder]), true);
  assert.equal(input.hasOnlyNoPartnersPlaceholder([singularPlaceholder]), true);
  assert.equal(input.hasOnlyNoPartnersPlaceholder([placeholderId]), true);
  assert.equal(input.hasOnlyNoPartnersPlaceholder([placeholder, realPartner]), false);
  assert.equal(input.hasOnlyNoPartnersPlaceholder([]), false);
  assert.equal(input.hasNoPartnersPlaceholder([placeholder]), true);
  assert.equal(input.hasNoPartnersPlaceholder([placeholder, realPartner]), true);
  assert.equal(input.hasNoPartnersPlaceholder([realPartner]), false);
  assert.equal(input.hasMixedNoPartnersPlaceholder([placeholder, realPartner]), true);
  assert.equal(input.hasMixedNoPartnersPlaceholder([singularPlaceholder, realPartner]), true);
  assert.equal(input.hasMixedNoPartnersPlaceholder([placeholder]), false);
  assert.equal(input.hasMixedNoPartnersPlaceholder([realPartner]), false);

  assert.equal(input.matchesPartnerFilter([placeholder], 'all', false), false);
  assert.equal(input.matchesPartnerFilter([placeholder], 'case-aside', false), true);
  assert.equal(input.matchesPartnerFilter([placeholder], 'without-documents', false, true), false);
  assert.equal(input.matchesPartnerFilter([placeholder], 'without-drive-folder', false, false, true), false);
  assert.equal(input.matchesPartnerFilter([realPartner], 'all', false), true);
  assert.equal(input.matchesPartnerFilter([placeholder, realPartner], 'all', false), false);
  assert.equal(input.matchesPartnerFilter([placeholder, realPartner], 'case-aside', false), true);
  assert.equal(input.matchesPartnerFilter([realPartner], 'all', true), false);
  assert.equal(input.matchesPartnerFilter([realPartner], 'without-documents', false, false), false);
  assert.equal(input.matchesPartnerFilter([placeholder], 'all', false, true), false);
  assert.equal(input.matchesPartnerFilter([realPartner], 'without-drive-folder', false, false, true), true);
  assert.equal(input.matchesPartnerFilter([placeholder, realPartner], 'case-aside', false, false, true), true);
  assert.equal(input.matchesPartnerFilter([realPartner], 'without-documents', false, true, true), false);
  assert.equal(input.matchesPartnerFilter([realPartner], 'without-drive-folder', false), false);
});

test('each company matches at most one distribution filter when classifications overlap', () => {
  const partner = { partnerId: 13, partnerName: 'Maria da Silva' };
  const noPartners = { partnerId: -999999, partnerName: 'Sem sócios' };
  const filters = ['all', 'case-aside', 'without-documents', 'without-drive-folder'];
  const cases = [
    { partners: [partner], caseAside: false, withoutDocuments: false, withoutDriveFolder: false, expected: 'all' },
    { partners: [partner], caseAside: true, withoutDocuments: false, withoutDriveFolder: false, expected: 'case-aside' },
    { partners: [partner], caseAside: true, withoutDocuments: true, withoutDriveFolder: false, expected: 'without-documents' },
    { partners: [partner], caseAside: true, withoutDocuments: true, withoutDriveFolder: true, expected: 'without-drive-folder' },
    { partners: [noPartners], caseAside: false, withoutDocuments: true, withoutDriveFolder: true, expected: 'case-aside' },
  ];

  for (const entry of cases) {
    const matches = filters.filter(filter => input.matchesPartnerFilter(
      entry.partners,
      filter,
      entry.caseAside,
      entry.withoutDocuments,
      entry.withoutDriveFolder,
    ));
    assert.deepEqual(matches, [entry.expected]);
  }
});

test('save API preserves blanks, rejects invalid percentages and checks partner company', async () => {
  let writes = 0;
  let matchingPartner = true;
  let stored;
  const tx = {
    $executeRaw: async () => 0,
    profitDistribution: {
      findFirst: async () => stored,
      create: async ({ data }) => { writes++; stored = { ...data, id: 1 }; return stored; },
      update: async ({ data }) => { writes++; stored = { ...stored, ...data }; return stored; },
    },
  };
  const api = load('app/api/profit-distributions/route.ts', {
    '@/lib/profit-distribution-auth': { requireDistributionUser: async () => null },
    '@/lib/profit-distribution-input': input,
    '@/lib/dividend-taxation': { isDividendTaxation: value => ['ISENTO', 'TRIBUTADO'].includes(value) },
    '@/lib/profit-distribution-status': { getProfitDistributionStatusOrNull: value => value === 'NAO_ENCERRADO' ? value : null },
    '@/lib/prisma': { __esModule: true, default: {
      referenceYear: { findUnique: async () => ({ year: 2025 }) },
      profitPartner: { findFirst: async () => matchingPartner ? { id: 1 } : null },
      $transaction: callback => callback(tx),
    } },
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@prisma/client': { Prisma: { Decimal: class { constructor(value) { this.value = value; } } }, ProfitDistributionStatus: { NAO_ENCERRADO: 'NAO_ENCERRADO' } },
    '@/lib/email': { sendProfitDistributionEmail: () => assert.fail('Unexpected email') },
    'next/cache': { revalidatePath: () => {} },
  });
  const save = changes => api.POST({ json: async () => ({ companyCnpj: '12345678000199', partnerId: 1,
    month: 1, year: 2025, amount: null, participationPercentage: null, ...changes }) });
  assert.equal((await save({})).status, 200);
  assert.equal(stored.amount, null);
  assert.equal(stored.participationPercentage, null);
  assert.equal((await save({ amount: 0, participationPercentage: 0 })).status, 200);
  assert.equal(stored.amount.value, 0);
  assert.equal(stored.referenceYear, 2025);
  assert.equal(stored.referenceMonth, 1);
  for (const participationPercentage of [101, -1, 'abc', 'Infinity', true]) {
    assert.equal((await save({ participationPercentage })).status, 400);
  }
  for (const companyCnpj of [123, {}, []]) {
    assert.equal((await save({ companyCnpj })).status, 400);
  }
  assert.equal((await api.POST({ json: async () => null })).status, 400);
  assert.equal((await api.POST({ json: async () => { throw new SyntaxError('Invalid JSON'); } })).status, 400);
  matchingPartner = false;
  assert.equal((await save({})).status, 400);
  assert.equal(writes, 2, 'Invalid requests must not write to the database');
});


test('distribution authorization rejects missing and disabled accounts', async () => {
  let user = null;
  let active = false;
  const auth = load('lib/profit-distribution-auth.ts', {
    '@/lib/auth': { getCurrentUser: async () => user },
    '@/lib/prisma': { __esModule: true, default: { user: { findUnique: async () => ({ active }) } } },
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options.status }) } },
  });
  assert.equal((await auth.requireDistributionUser()).status, 401);
  user = { id: 1 };
  assert.equal((await auth.requireDistributionUser()).status, 401);
  active = true;
  assert.equal(await auth.requireDistributionUser(), null);
});

test('every distribution endpoint rejects unauthenticated requests before side effects', async () => {
  const denied = { status: 401 };
  for (const file of ['route.ts', 'partners/route.ts', '[id]/route.ts', 'company/route.ts']) {
    const api = load(`app/api/profit-distributions/${file}`, {
      '@/lib/profit-distribution-auth': { requireDistributionUser: async () => denied },
      '@/lib/profit-distribution-input': input,
      '@/lib/dividend-taxation': {},
      '@/lib/profit-distribution-status': {},
      '@/lib/prisma': { __esModule: true, default: {} },
      'next/server': {},
      '@prisma/client': {},
      '@/lib/email': {},
      'next/cache': {},
    });
    for (const handler of Object.values(api)) {
      assert.equal(await handler({}, { params: Promise.resolve({ id: '1' }) }), denied);
    }
  }
});

test('company settings are isolated by company and year and never overwrite partner months', async () => {
  const records = new Map();
  let companyExists = true;
  let yearExists = true;
  const api = load('app/api/profit-distributions/company/route.ts', {
    '@/lib/profit-distribution-auth': { requireDistributionUser: async () => null },
    '@/lib/profit-distribution-input': input,
    '@/lib/dividend-taxation': { isDividendTaxation: value => ['ISENTO', 'TRIBUTADO'].includes(value) },
    '@/lib/profit-distribution-status': { isProfitDistributionStatus: value => ['NAO_ENCERRADO', 'ENCERRADO_COM_LUCRO'].includes(value) },
    '@/lib/prisma': { __esModule: true, default: {
      company: { findFirst: async () => companyExists ? { cnpj: '12345678000199' } : null },
      referenceYear: { findUnique: async () => yearExists ? { year: 2025 } : null },
      profitCompanySettings: { upsert: async ({ where, create, update }) => {
        const key = JSON.stringify(where.companyCnpj_referenceYear);
        const saved = records.has(key) ? { ...records.get(key), ...update } : create;
        assert.equal('amount' in saved, false);
        assert.equal('partnerId' in saved, false);
        records.set(key, saved);
        return saved;
      } },
    } },
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    'next/cache': { revalidatePath: () => {} },
  });
  const save = changes => api.PUT({ json: async () => ({ companyCnpj: '12345678000199', year: 2025,
    participationPercentage: null, dividendTaxation: null, status: 'NAO_ENCERRADO', observation: '', caseAside: false, ...changes }) });
  assert.equal((await save({ participationPercentage: 0 })).body.participationPercentage, 0);
  assert.equal((await save({ participationPercentage: 25.5, dividendTaxation: 'ISENTO', status: 'ENCERRADO_COM_LUCRO', observation: ' Annual ' })).body.observation, 'Annual');
  assert.equal((await save({ year: 2026 })).status, 200);
  assert.equal((await save({ companyCnpj: '98765432000199' })).status, 200);
  assert.equal(records.size, 3);
  for (const changes of [{ participationPercentage: -1 }, { participationPercentage: 101 }, { participationPercentage: 1.234 },
    { participationPercentage: undefined }, { status: 'INVALID' }, { dividendTaxation: 'INVALID' },
    { observation: [] }, { year: '2025' }, { companyCnpj: {} }]) {
    assert.equal((await save(changes)).status, 400);
  }
  assert.equal((await api.PUT({ json: async () => null })).status, 400);
  companyExists = false;
  assert.equal((await save({})).status, 404);
  companyExists = true;
  yearExists = false;
  assert.equal((await save({})).status, 400);
  assert.equal(records.size, 3);
});
