const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('page reload restores all saved monthly fields and the annual total', async () => {
  let year = 2025;
  const savedMonths = [
    { month: 0, amount: '34.34', dividendTaxation: 'ISENTO' },
    { month: 1, amount: '43.23', dividendTaxation: 'TRIBUTADO' },
    { month: 2, amount: '0.01', dividendTaxation: 'ISENTO' },
    { month: 11, amount: '0.00', dividendTaxation: null },
  ].map((item, index) => ({
    ...item,
    id: index + 1,
    referenceDate: new Date('2026-09-11T12:00:00Z'),
    referenceMonth: item.month + 1,
    participationPercentage: index === 3 ? '0.00' : '25.50',
    status: 'NAO_ENCERRADO',
    observation: `Saved month ${item.month + 1}`,
  }));
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    '@/lib/profit-distribution-input': { normalizeDistributionSearch: (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { redirect: () => assert.fail('Unexpected redirect') },
    '@/lib/auth': { getCurrentUser: async () => ({ id: 1 }) },
    '@prisma/client': { ProfitDistributionStatus: { NAO_ENCERRADO: 'NAO_ENCERRADO' } },
    './components/DistribuicaoTable': { DistribuicaoTable: 'MonthlyTable' },
    '@/lib/prisma': { __esModule: true, default: {
      referenceYear: { findMany: async () => [{ year: 2025 }, { year: 2026 }] },
      company: { findMany: async (query) => {
      const selection = query.select.profitPartners.select.distributions;
      assert.equal(selection.take, undefined, 'Must not load only the most recent month');
      assert.equal(selection.where.referenceYear, year);
      assert.equal(selection.where.referenceDate, undefined, 'Modification date must not filter the accounting year');
      return [{ cnpj: '12345678000199', name: 'Company', qsas: [{ nome: 'Partner' }, { nome: 'Second partner' }],
        profitPartners: [{ id: 7, name: 'Partner', distributions: [...savedMonths, { ...savedMonths[0], id: 0, amount: "999.00" }] }] }];
    } } } },
  };
  const source = fs.readFileSync(path.join(__dirname, '../app/dashboard/distribuicao-lucros/page.tsx'), 'utf8');
  const context = { exports: {}, require: (name) => {
    assert.ok(name in mocks, `Unexpected import: ${name}`);
    return mocks[name];
  } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020,
  } }).outputText, context);

  for (const requestedYear of [undefined, '2025', '2026', '2099']) {
    year = requestedYear === '2026' ? 2026 : 2025;
    const page = await context.exports.default({ searchParams: Promise.resolve({ year: requestedYear }) });
    const props = page.props.children.props.children.find((child) => child.type === 'MonthlyTable').props;
    assert.equal(props.year, year);
    assert.equal(props.canCreatePartner, year === new Date().getFullYear(), 'Partner button is only available in the current year');
    assert.equal(props.rows.length, 2, 'Unregistered QSA partners remain visible, without duplicating the registered partner');
    assert.equal(props.rows[1].partnerName, 'Second partner');
    const row = props.rows[0];
    assert.equal(row.partnerId, 7);
    assert.equal(row.companyCnpj, '12345678000199');
    assert.equal(row.monthlyDistributions.length, 4);
    row.monthlyDistributions.forEach((month, index) => {
      const saved = savedMonths[index];
      assert.equal(month.month, saved.month);
      assert.equal(month.amount, Number(saved.amount));
      assert.equal(month.participationPercentage, Number(saved.participationPercentage));
      assert.equal(month.dividendTaxation, saved.dividendTaxation);
      assert.equal(month.status, saved.status);
      assert.equal(month.observation, saved.observation);
    });
    assert.equal(row.monthlyDistributions.reduce((sum, month) => sum + Math.round(month.amount * 100), 0), 7758);
  }
});
