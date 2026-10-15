import { test } from "node:test";
import assert from "node:assert/strict";
import { ownershipCasePolicy } from "../lib/ownership-case-policy";

test("explicit company instructions route the ownership batch", () => {
  for (const name of ["A M P DA SILVA", "Amanda Martins Batista", "Ana Carolina Albano Martins",
    "Ana Caroline Albano Martins",
    "Antonio Teles Frota Junior & Cia Ltda"]) {
    assert.equal(ownershipCasePolicy(name).action, "skip");
  }
  for (const name of ["Águias Mídias"]) {
    assert.equal(ownershipCasePolicy(name).action, "review");
  }
  assert.equal(ownershipCasePolicy("ASSOCIACAO AMIGOS DO BRASIL").action, "review");
  assert.equal(ownershipCasePolicy("AM Patrimonial Ltda").action, "standard");
  assert.equal(ownershipCasePolicy("Ar Frio Ltda").action, "standard");
  assert.equal(ownershipCasePolicy("Alpitel Telecom Ltda").action, "corporate-partner");
  assert.equal(ownershipCasePolicy("Outra Empresa Ltda").action, "standard");
});
