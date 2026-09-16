import assert from "node:assert/strict";
import test from "node:test";

import {
    applySyncPlan,
    buildSyncPlan,
    normalizeCnpj,
} from "../scripts/companies/syncCompaniesFromOdbc";

test("normalizeCnpj removes punctuation and validates length", () => {
    assert.equal(normalizeCnpj("12.345.678/0001-99"), "12345678000199");
    assert.equal(normalizeCnpj(" 12345678000199 "), "12345678000199");
    assert.equal(normalizeCnpj("ABC"), null);
});

test("buildSyncPlan detects creates, restores and archive candidates", () => {
    const odbcCompanies = [
        { cnpj: "12.345.678/0001-99", name: "Empresa Nova" },
        { cnpj: "11.111.111/0001-11", name: "Empresa Restabelecida" },
        { cnpj: "22.222.222/0001-22", name: "Empresa Já Ativa" },
    ];

    const crmCompanies = [
        { cnpj: "11.111.111/0001-11", name: "Empresa Restabelecida", deletedAt: new Date("2024-01-01T00:00:00Z") },
        { cnpj: "22.222.222/0001-22", name: "Empresa Já Ativa", deletedAt: null },
        { cnpj: "98.765.432/0001-77", name: "Empresa Ausente", deletedAt: null },
    ];

    const plan = buildSyncPlan(odbcCompanies, crmCompanies);

    assert.deepEqual(plan.toCreate.map((item) => item.cnpj), ["12345678000199"]);
    assert.deepEqual(plan.toRestore, ["11111111000111"]);
    assert.deepEqual(plan.toArchive, ["98765432000177"]);
    assert.deepEqual(plan.toKeep, ["22222222000122"]);
});

test("buildSyncPlan archives by name when the same company has a different CNPJ or is absent from ODBC", () => {
    const odbcCompanies = [
        { cnpj: "12.345.678/0001-99", name: "Empresa Que Permanece" },
    ];

    const crmCompanies = [
        { cnpj: "11.111.111/0001-11", name: "MDA CONSTRUCOES LTDA", deletedAt: null },
        { cnpj: "12.345.678/0001-99", name: "Empresa Que Permanece", deletedAt: null },
    ];

    const plan = buildSyncPlan(odbcCompanies, crmCompanies);

    assert.deepEqual(plan.toArchive, ["11111111000111"]);
});

test("buildSyncPlan archives by name when CRM has no valid CNPJ", () => {
    const odbcCompanies = [{ cnpj: "12.345.678/0001-99", name: "Empresa Que Permanece" }];

    const crmCompanies = [
        { cnpj: "", name: "MDA CONSTRUCOES LTDA", deletedAt: null },
        { cnpj: "12.345.678/0001-99", name: "Empresa Que Permanece", deletedAt: null },
    ];

    const plan = buildSyncPlan(odbcCompanies, crmCompanies);

    assert.ok(plan.toArchiveByName.includes("mda construcoes ltda"));
});

test("applySyncPlan permanently deletes missing companies and their data", async () => {
    const plan = {
        toCreate: [],
        toRestore: [],
        toRestoreByName: [],
        toArchive: ["98765432000177"],
        toArchiveByName: [],
        toKeep: ["22222222000122"],
        archived: [],
    };

    const calls: string[] = [];
    const prisma = {
        company: { deleteMany: async () => { calls.push("company"); return { count: 1 }; } },
        note: { deleteMany: async () => { calls.push("note"); return { count: 0 }; } },
        companySectorOwner: { deleteMany: async () => ({ count: 0 }) },
        companySector: { deleteMany: async () => ({ count: 0 }) },
        companyActivity: { deleteMany: async () => ({ count: 0 }) },
        companySystem: { deleteMany: async () => ({ count: 0 }) },
        companyQsa: { deleteMany: async () => ({ count: 0 }) },
        contact: { deleteMany: async () => ({ count: 0 }) },
        attachment: { deleteMany: async () => ({ count: 0 }) },
        certificate: { deleteMany: async () => ({ count: 0 }) },
        companyProfile: { deleteMany: async () => ({ count: 0 }) },
        profitDistribution: { deleteMany: async () => ({ count: 0 }) },
        profitPartner: { deleteMany: async () => ({ count: 0 }) },
        $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    } as unknown as Parameters<typeof applySyncPlan>[1];

    const result = await applySyncPlan(plan, prisma);

    assert.deepEqual(result.archived, 1);
    assert.equal(calls.at(-1), "company");
});
