import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractedPartnerSchema,
  findPersistedOwnershipPartner,
  ownershipImportSchema,
  ownershipSyncSchema,
  persistenceIssues,
  validCpf,
} from "../lib/ownership-validation";
import { formatCapital, sumCapital } from "../lib/ownership-money";

const partner = {
  name: "Pessoa Teste", cpf: "52998224725", birthDate: "1980-02-29",
  ownershipHistory: [{ effectiveAt: "2024-01-01", sequence: 0, percentageBps: 10000,
    capitalCents: "2000000", sourceFileId: "fixture", sourceHash: "a".repeat(64) }],
};
test("identity validates checksum, real birth date, required birth and future date", () => {
  assert.ok(validCpf(partner.cpf));
  for (const cpf of ["11111111111", "52998224724", "123"]) assert.equal(validCpf(cpf), false);
  assert.ok(extractedPartnerSchema.safeParse(partner).success);
  for (const birthDate of [null, "2023-02-29", "2999-01-01"]) {
    assert.equal(extractedPartnerSchema.safeParse({ ...partner, birthDate }).success, false);
  }
  assert.ok(extractedPartnerSchema.safeParse({ ...partner, cpf: null, partnerCnpj: "00000000000100", birthDate: null }).success);
});
test("complete snapshots must total 100% and have unique identities", () => {
  const payload = { companyCnpj: "00000000000100", partners: [partner] };
  assert.ok(ownershipImportSchema.safeParse(payload).success);
  assert.ok(ownershipImportSchema.safeParse({ ...payload, mode: "document-set" }).success);
  assert.equal(ownershipImportSchema.safeParse({ ...payload, partners: [] }).success, false);
  assert.equal(ownershipImportSchema.safeParse({ ...payload, partners: [{ ...partner,
    ownershipHistory: [{ ...partner.ownershipHistory[0], capitalCents: "invalid" }] }] }).success, false);
  assert.equal(ownershipImportSchema.safeParse({ ...payload, partners: [partner, partner] }).success, false);
  assert.equal(ownershipImportSchema.safeParse({ ...payload, partners: [{ ...partner,
    ownershipHistory: [{ ...partner.ownershipHistory[0], percentageBps: 9500 }] }] }).success, false);
});
test("name-only import requires a recognized table and unique names", () => {
  const payload = { mode: "names-only", companyCnpj: "00000000000100",
    partners: [{ name: "Ana Silva" }, { name: "Bruno Souza" }],
    documents: [{ sourceFileId: "drive-id", filename: "contrato.pdf", status: "names-only" }] };
  assert.ok(ownershipSyncSchema.safeParse(payload).success);
  assert.equal(ownershipImportSchema.safeParse(payload).success, false);
  assert.equal(ownershipSyncSchema.safeParse({ ...payload, partners: [{ name: "Ana Silva" }, { name: "ANA SILVA" }] }).success, false);
  assert.equal(ownershipSyncSchema.safeParse({ ...payload, documents: [] }).success, false);
  assert.equal(ownershipSyncSchema.safeParse({ ...payload, partners: [{ name: "10.000" }] }).success, false);
});
test("single-owner QSA import may omit identity but requires one partner at 100%", () => {
  const payload = { mode: "qsa-sole-owner", companyCnpj: "00000000000100", partners: [{
    name: "Kauane de Melo Lima", cpf: null, partnerCnpj: null, birthDate: null,
    ownershipHistory: [{ ...partner.ownershipHistory[0], capitalCents: "1000000" }],
  }] };
  assert.ok(ownershipSyncSchema.safeParse(payload).success);
  assert.equal(ownershipSyncSchema.safeParse({ ...payload, partners: [
    { ...payload.partners[0], ownershipHistory: [{ ...partner.ownershipHistory[0], percentageBps: 9900 }] },
  ] }).success, false);
  assert.equal(ownershipSyncSchema.safeParse({ ...payload, partners: [...payload.partners, ...payload.partners] }).success, false);
  assert.deepEqual(persistenceIssues(payload.partners[0], payload.partners[0], true), []);
});
test("name-based ownership history accepts a complete table when birth OCR is incomplete", () => {
  const event = { ...partner.ownershipHistory[0], percentageBps: 3334 };
  const names = ["Rodrigo Silveira Lima", "Victor Regis Brasil e Silva", "Jose Luciano Solon Dias Junior"];
  const payload = { companyCnpj: "16567916000168", mode: "name-based-history",
    partners: names.map((name, index) => ({
      name, cpf: ["95397175315", "01950194310", "01769293396"][index], partnerCnpj: null,
      birthDate: null, ownershipHistory: [{ ...event, percentageBps: index === 0 ? 3334 : 3333 }],
    })) };
  assert.ok(ownershipSyncSchema.safeParse(payload).success);
  assert.equal(ownershipSyncSchema.safeParse({ ...payload, partners: payload.partners.map((item, index) => ({
    ...item, ownershipHistory: [{ ...item.ownershipHistory[0], percentageBps: index === 0 ? 3333 : 3333 }],
  })) }).success, false);
});
test("single-partner history with validated CPF may omit an unreadable birth date", () => {
  const payload = { companyCnpj: "00000000000100", mode: "name-based-history", partners: [{
    name: partner.name, cpf: partner.cpf, partnerCnpj: null, birthDate: null,
    ownershipHistory: partner.ownershipHistory,
  }] };
  assert.ok(ownershipSyncSchema.safeParse(payload).success);
});

test("processing audit accepts bounded metadata and rejects invalid confidence", () => {
  const payload = {
    correlationId: "550e8400-e29b-41d4-a716-446655440000",
    companyCnpj: "00000000000100",
    partners: [partner],
    documents: [{
      sourceFileId: "drive-id", filename: "contrato.pdf", status: "used", issues: [],
      mimeType: "application/pdf", sizeBytes: 1024, sha256: "b".repeat(64),
      pageMetrics: [{ page: 1, method: "ocr", confidence: 91.5, strategy: "automatic" }],
    }],
  };
  assert.ok(ownershipImportSchema.safeParse(payload).success);
  assert.equal(ownershipImportSchema.safeParse({ ...payload, documents: [{
    ...payload.documents[0], pageMetrics: [{ page: 1, method: "ocr", confidence: 101 }],
  }] }).success, false);
});
test("read-back detects missing and changed persisted data without reporting personal data", () => {
  assert.deepEqual(persistenceIssues(partner, partner), []);
  assert.ok(persistenceIssues(partner, null).length);
  assert.deepEqual(persistenceIssues(partner, { ...partner, birthDate: "1980-03-01" }), ["birthDate"]);
  assert.ok(persistenceIssues(partner, { ...partner, ownershipHistory: [{ ...partner.ownershipHistory[0], percentageBps: 5000 }] }).length);
});
test("post-commit lookup prefers exact identity over duplicate placeholder names", () => {
  const identified = { name: "Marcos Inacio Gazarra Tartaglione", cpf: partner.cpf, partnerCnpj: null };
  const placeholder = { name: "Marcos Inacio Gazarra Tartaglione", cpf: null, partnerCnpj: null };
  assert.equal(
    findPersistedOwnershipPartner([placeholder, identified], {
      name: partner.name, cpf: partner.cpf, partnerCnpj: null,
    }),
    identified,
  );
});
test("post-commit lookup does not choose among duplicate unverified names", () => {
  const duplicates = [
    { name: "Vinicius de Castro Coutinho", cpf: null, partnerCnpj: null },
    { name: "VINICIUS DE CASTRO COUTINHO", cpf: null, partnerCnpj: null },
  ];
  assert.equal(findPersistedOwnershipPartner(duplicates, {
    name: partner.name, cpf: null, partnerCnpj: null,
  }), undefined);
});
test("capital totals use integer cents; incomplete totals remain unknown", () => {
  assert.equal(sumCapital(["1000000", "1000000"]), "2000000");
  assert.equal(sumCapital(["1000000", null]), null);
  assert.equal(sumCapital([]), null);
  assert.equal(formatCapital("2000000"), "R$ 20.000,00");
});
