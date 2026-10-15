import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAmbiguousExistingPartnerLinkError,
  isNoImportableOwnershipHistoryError,
  isNoOwnershipDocumentError,
} from "../lib/ownership-sync-errors";

test("recognizes no-importable-history errors with accented or damaged terminal text", () => {
  assert.equal(
    isNoImportableOwnershipHistoryError(
      "Sync interrupted (code 1). Nenhum histórico societário importável encontrado. "
      + "Aditivo: conteúdo sem pontuação.",
    ),
    true,
  );
  assert.equal(
    isNoImportableOwnershipHistoryError(
      "Nenhum hist�rico societ�rio import�vel encontrado. Aditivo: conteúdo sem pontuação.",
    ),
    true,
  );
});

test("does not classify other extraction failures as skippable", () => {
  assert.equal(
    isNoImportableOwnershipHistoryError("Busca de pastas incompleta no Drive."),
    false,
  );
  assert.equal(
    isNoImportableOwnershipHistoryError(
      "Nenhum arquivo relacionado ao quadro societário identificado na pasta.",
    ),
    false,
  );
});

test("recognizes missing corporate-document candidate errors", () => {
  assert.equal(
    isNoOwnershipDocumentError(
      "Sync interrupted (code 1). Nenhum arquivo relacionado ao quadro societário "
      + "ou às suas alterações foi identificado pelo nome na pasta ou subpastas.",
    ),
    true,
  );
  assert.equal(
    isNoOwnershipDocumentError(
      "Nenhum arquivo relacionado ao quadro societ�rio ou �s suas altera��es "
      + "foi identificado pelo nome na pasta ou subpastas.",
    ),
    true,
  );
  assert.equal(
    isNoOwnershipDocumentError("Pasta da empresa não encontrada com segurança."),
    false,
  );
});

test("classifies ambiguous legacy partner links for manual review", () => {
  assert.equal(
    isAmbiguousExistingPartnerLinkError(
      "Vínculo ambíguo por nome e sem CPF/CNPJ único; revise o cadastro antes de importar",
    ),
    true,
  );
  assert.equal(
    isAmbiguousExistingPartnerLinkError(
      "V�nculo amb�guo por nome e sem CPF/CNPJ �nico; revise o cadastro antes de importar",
    ),
    true,
  );
  assert.equal(isAmbiguousExistingPartnerLinkError("Timeout ao acessar o Drive"), false);
});
