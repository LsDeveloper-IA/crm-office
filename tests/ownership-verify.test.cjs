const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('audit distinguishes missing files, malformed JSON and missing required fields', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'ownership-verify-test-'));
  const file = path.join(directory, 'input.json');
  const run = () => spawnSync(process.execPath,
    ['--import', 'tsx', 'scripts/ownership/verify.ts', file],
    { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true });
  try {
    let result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Arquivo não encontrado/);
    writeFileSync(file, '{');
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /não contém JSON válido/);
    writeFileSync(file, JSON.stringify({ companyCnpj: '00000000000100', partners: [] }));
    result = run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /campos obrigatórios/);
    assert.match(result.stderr, /partners/);
    assert.doesNotMatch(result.stderr, /etapa: banco de dados/);
  } finally {
    rmSync(file, { force: true });
    require('node:fs').rmdirSync(directory);
  }
});
