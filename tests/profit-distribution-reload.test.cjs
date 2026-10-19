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
    '@/lib/ownership-money': { sumCapital: values => values.some(value => value == null)
      ? null : values.reduce((sum, value) => sum + BigInt(value), 0n).toString() },
    '@/lib/ownership': {
      ownershipForYear: () => ({ ownershipPercentage: 25, ownershipValueCents: '2500000', months: [] }),
      safeOwnershipForYear: () => ({ ownershipPercentage: 25, ownershipValueCents: '2500000', quotas: null, months: [], valid: true, issue: null }),
    },
    '@/lib/partner-periods.mjs': { partnerVisibility: () => ({ visibleMonths: Array.from({ length: 12 }, (_, i) => i), caption: 'Resumo anual' }) },
    '@/lib/profit-distribution-input': { normalizeDistributionSearch: (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/navigation': { redirect: () => assert.fail('Unexpected redirect') },
    '@/lib/auth': { getCurrentUser: async () => ({ id: 1 }) },
    '@prisma/client': { ProfitDistributionStatus: { NAO_ENCERRADO: 'NAO_ENCERRADO' } },
    './components/DistribuicaoTable': { DistribuicaoTable: 'MonthlyTable' },
    '../../../empresas-sem-socios-sem-pasta-drive.json': { default: [] },
    '../../../empresas-filtros-automacao.json': { default: [] },
    '@/lib/prisma': { __esModule: true, default: {
      referenceYear: { findMany: async () => [{ year: 2025 }, { year: 2026 }] },
      company: { findMany: async (query) => {
      const selection = query.select.profitPartners.select.distributions;
      assert.equal(selection.take, undefined, 'Must not load only the most recent month');
      assert.equal(selection.where.referenceYear, year);
      assert.equal(selection.where.referenceDate, undefined, 'Modification date must not filter the accounting year');
      assert.equal(query.select.profitSettings.where.referenceYear, year);
      return [{ cnpj: '12345678000199', name: 'Company', qsas: [{ id: 11, nome: 'Partner' }, { id: 12, nome: 'Second partner' }],
        profitSettings: [{ participationPercentage: '25.50', dividendTaxation: 'ISENTO', status: 'NAO_ENCERRADO', observation: `Company ${year}` }],
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
    const defaultYear = [2025, 2026].includes(new Date().getFullYear()) ? new Date().getFullYear() : 2026;
    year = requestedYear === '2025' ? 2025 : requestedYear === '2026' ? 2026 : defaultYear;
    const page = await context.exports.default({ searchParams: Promise.resolve({ year: requestedYear }) });
    const props = page.props.children.props.children.find((child) => child.type === 'MonthlyTable').props;
    assert.equal(props.year, year);
    assert.equal(props.companySettings['12345678000199'].participationPercentage, 25.5);
    assert.equal(props.companySettings['12345678000199'].dividendTaxation, 'ISENTO');
    assert.equal(props.companySettings['12345678000199'].observation, `Company ${year}`);
    assert.equal(props.canCreatePartner, year === new Date().getFullYear(), 'Partner button is only available in the current year');
    assert.equal(props.rows.length, 2, 'Unregistered QSA partners remain visible, without duplicating the registered partner');
    assert.equal(props.rows[0].ownershipPercentage, 25);
    assert.equal(props.rows[0].ownershipValueCents, '2500000');
    assert.equal(props.rows[0].companyCapitalCents, null, 'A pending QSA partner prevents a misleading partial capital total');
    assert.equal(props.rows[1].partnerName, 'Second partner');
    assert.equal(props.rows[1].qsaId, 12, 'Pending QSA partners retain their source ID for removal');
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
