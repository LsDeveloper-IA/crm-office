import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).parents[1]

extract_spec = importlib.util.spec_from_file_location("ownership_extract", ROOT / "scripts/ownership/extract.py")
extract = importlib.util.module_from_spec(extract_spec)
extract_spec.loader.exec_module(extract)

corpus_spec = importlib.util.spec_from_file_location("ownership_corpus", ROOT / "scripts/ownership/corpus.py")
corpus = importlib.util.module_from_spec(corpus_spec)
corpus_spec.loader.exec_module(corpus)


class CorpusParserTest(unittest.TestCase):
    def test_normalized_repairs_cp1252_f_hook_mojibake(self):
        self.assertEqual(corpus.normalized("CONSTITUIÃ‡ÃƒO"), "CONSTITUICAO")

    def test_sequence_prefers_aditivo_ordinal_to_lower_alteration_reference(self):
        text = (
            "6” (SEXTO) ADITIVO. Ato posterior: 7” aditivo. "
            "002 ALTERAÇÃO CONTRATUAL."
        )
        self.assertEqual(corpus.sequence(text), 7)
        self.assertEqual(corpus.sequence("002 ALTERAÇÃO CONTRATUAL"), 2)

    def test_percentage_ocr_mismatch_reconciles_only_when_amounts_equal_capital(self):
        rows = [
            {"name": "SOCIO A", "percentageBps": 3300, "amount": 333334, "quotas": 333334},
            {"name": "SOCIO B", "percentageBps": 3300, "amount": 333333, "quotas": 333333},
            {"name": "SOCIO C", "percentageBps": 3300, "amount": 333333, "quotas": 333333},
        ]

        snapshot = corpus._validate_snapshot(1000000, 1000000, rows)

        self.assertEqual([row["percentageBps"] for row in snapshot["rows"]], [3334, 3333, 3333])

    def test_percentage_mismatch_is_not_reconciled_when_amounts_do_not_equal_capital(self):
        rows = [
            {"name": "SOCIO A", "percentageBps": 6000, "amount": 600000, "quotas": 600000},
            {"name": "SOCIO B", "percentageBps": 3900, "amount": 390000, "quotas": 390000},
        ]

        with self.assertRaisesRegex(ValueError, "quadro nÃ£o fecha em 100%"):
            corpus._validate_snapshot(1000000, 1000000, rows)

    def test_official_qsa_receipt_with_one_partner_assigns_full_declared_capital(self):
        text = (
            "Consulta Quadro de SÃ³cios e Administradores - QSA\n"
            "CNPJ:\n44.939.237/0001-08\n"
            "NOME EMPRESARIAL:\nKML PLANEJAMENTO E GERENCIAMENTO DE OBRAS LTDA\n"
            "CAPITAL SOCIAL:\nR$10.000,00 (Dez mil reais)\n"
            "Nome/Nome Empresarial:\nKAUANE DE MELO LIMA\n"
            "QualificaÃ§Ã£o:\n49-SÃ³cio-Administrador\n"
            "Para informaÃ§Ãµes relativas Ã  participaÃ§Ã£o no QSA, acessar o e-CAC.\n"
            "Emitido no dia 26/11/2025 Ã s 11:47 (data e hora de BrasÃ­lia)."
        )
        source = {"id": "qsa-file", "name": "QSA.pdf", "hash": "a" * 64, "text": text}
        result = corpus.single_owner_qsa_snapshot(
            source, "44939237000108", "KML PLANEJAMENTO E GERENCIAMENTO DE OBRAS LTDA"
        )
        self.assertEqual(result["mode"], "qsa-sole-owner")
        self.assertEqual(result["partners"][0]["name"], "KAUANE DE MELO LIMA")
        self.assertEqual(result["partners"][0]["ownershipHistory"][0]["percentageBps"], 10000)
        self.assertEqual(result["partners"][0]["ownershipHistory"][0]["capitalCents"], "1000000")
        self.assertEqual(result["partners"][0]["ownershipHistory"][0]["effectiveAt"], "2025-11-26")
        self.assertIsNone(result["partners"][0]["cpf"])

    def test_single_partner_qsa_with_values_on_following_lines_gets_full_percentage(self):
        text = (
            "Consulta Quadro de Sócios e Administradores - QSA\n"
            "CNPJ:\n20.612.090/0001-89\n"
            "NOME EMPRESARIAL:\nFC AUTO PECAS LTDA\n"
            "CAPITAL SOCIAL:\nR$ 80.000,00\n"
            "Nome/Nome Empresarial:\nPESSOA TESTE\n"
            "Qualificacao:\n49-Socio-Administrador\n"
            "Para informacoes relativas a participacao no QSA, acessar o e-CAC.\n"
            "Emitido no dia 02/10/2026 as 11:47 (data e hora de Brasilia)."
        )
        source = {
            "id": "single-qsa-line-values",
            "name": "QSA.pdf",
            "hash": "c" * 64,
            "createdTime": "2026-10-02T14:47:00Z",
            "text": text,
        }

        result = corpus.single_owner_qsa_snapshot(
            source, "20612090000189", "FC AUTO PECAS LTDA"
        )

        self.assertIsNotNone(result)
        self.assertEqual(len(result["partners"]), 1)
        self.assertEqual(result["partners"][0]["name"], "PESSOA TESTE")
        self.assertEqual(
            result["partners"][0]["ownershipHistory"][0]["percentageBps"], 10000
        )
        self.assertEqual(
            result["partners"][0]["ownershipHistory"][0]["capitalCents"], "8000000"
        )

    def test_qsa_without_listed_rows_uses_personal_business_name_as_sole_owner(self):
        text = (
            "Consulta Quadro de Sócios e Administradores - QSA\n"
            "CNPJ:\n38.190.412/0001-04\n"
            "NOME EMPRESARIAL:\nANA CAROLINE ALBANO MARTINS\n"
            "CAPITAL SOCIAL:\nR$10.000,00 (Dez mil reais)\n\n"
            "NÃO HÁ INFORMAÇÃO DE QUADRO DE SÓCIOS E ADMINISTRADORES (QSA) NA BASE DE DADOS DO CNPJ"
        )
        source = {"id": "qsa-no-rows", "name": "QSA.pdf", "hash": "b" * 64,
                 "createdTime": "2025-03-01T12:00:00Z", "text": text}
        result = corpus.single_owner_qsa_snapshot(
            source, "38190412000104", "ANA CAROLINE ALBANO MARTINS"
        )
        self.assertEqual(result["mode"], "qsa-sole-owner")
        self.assertEqual(result["partners"][0]["name"], "ANA CAROLINE ALBANO MARTINS")
        self.assertEqual(result["partners"][0]["ownershipHistory"][0]["percentageBps"], 10000)
        self.assertEqual(result["partners"][0]["ownershipHistory"][0]["capitalCents"], "1000000")
        self.assertEqual(result["partners"][0]["ownershipHistory"][0]["effectiveAt"], "2025-03-01")

    def test_written_prose_partner_details(self):
        text = (
            "José Washington Bastos Brasil, 30.000 (trinta mil) quotas, no valor nominal de R$ 1,00 "
            "cada, correspondendo a R$ 30.000,00 (trinta mil reais), totalmente integralizado em "
            "moeda corrente do país, representando 50% (cinqüenta) por cento do capital social e;\n"
            "Maria Ditácia Bastos Brasil, 30.000 (trinta mil) quotas no valor nominal de R$ 1,00 "
            "cada, correspondendo a R$ 30.000,00 (trinta mil reais), totalmente integralizado em "
            "moeda corrente do país, representando 50% (cinqüenta) por cento do capital social."
        )
        table = corpus.read_tables(text)
        self.assertEqual([row["name"] for row in table["rows"]], [
            "JOSE WASHINGTON BASTOS BRASIL", "MARIA DITACIA BASTOS BRASIL",
        ])
        self.assertEqual([row["percentageBps"] for row in table["rows"]], [5000, 5000])
        self.assertEqual(table["capitalCents"], "6000000")
    def test_docling_duplicate_markdown_cells_and_malformed_percent(self):
        text = (
            "O capital social Ã© de R$ 10.000,00 dividido em 10.000 quotas.\n"
            "| SÃ³cios | Quotas | % | Valor (R$) |\n"
            "|---|---|---|---|\n"
            "| Pedro Lonngren Sampaio | 5.500 | %5% | 5.500,00 |\n"
            "| Viliberto Porto Matos | 3.000 | 30% | 3.000,00 |\n"
            "| Diego Silva Cruz | 1.500 | 15% | 1.500,00 |\n"
            "| TOTAL | 10.000 | 100% | 10.000,00 |\n"
            "| SÃ³cios | Quotas | % | Valor (R$) |\n"
            "|---|---|---|---|\n"
            "| Pedro Lonngren Sampaio | 5.500 | 55% | 5.500,00 |\n"
            "| Viliberto Porto Matos Viliberto Porto Matos | 3.000 3.000 | 30% 30% | 3.000,00 3.000,00 |\n"
            "| Diego Silva Cruz Diego Silva Cruz | 1.500 1.500 | 15% 15% | 1.500,00 1.500,00 |\n"
            "| TOTAL TOTAL | 10.000 10.000 | 100% 100% | 10.000,00 10.000,00 |\n"
        )
        table = corpus.read_tables(text)
        self.assertEqual([row["name"] for row in table["rows"]], [
            "PEDRO LONNGREN SAMPAIO", "VILIBERTO PORTO MATOS", "DIEGO SILVA CRUZ",
        ])
        self.assertEqual([row["percentageBps"] for row in table["rows"]], [5500, 3000, 1500])

    def test_restores_blank_ocr_name_from_complete_contract_partner_roster(self):
        text = (
            "RODRIGO SILVEIRA LIMA, brasileiro, nascido em 1982, CPF 95397175315\n"
            "VICTOR REGIS BRASIL E SILVA, brasileiro, nascido em 1986, CPF 01950194310\n"
            "JOSE LUCIANO SOLON DIAS JUNIOR, brasileiro, nascido em 1985, CPF 01769293396\n"
            "CLAUSULA 4 - CAPITAL SOCIAL R$ 12.000,00\n"
            "| SOCIOS | N QUOTAS | VALOR EM R$ |\n"
            "|---|---|---|\n"
            "| | 4.000 | 4.000,00 |\n"
            "| VICTOR REGIS BRASIL E SILVA... | 4.000 | 4.000,00 |\n"
            "| JOSE LUCIANO SOLON DIAS JUNIOR | 4.000 | 4.000,00 |\n"
            "| TOTAL | 12.000 | 12.000,00 |\n"
        )
        table = corpus.read_tables(text)
        self.assertEqual([row["name"] for row in table["rows"]], [
            "RODRIGO SILVEIRA LIMA", "VICTOR REGIS BRASIL E SILVA", "JOSE LUCIANO SOLON DIAS JUNIOR",
        ])
        self.assertEqual([row["percentageBps"] for row in table["rows"]], [3334, 3333, 3333])
        self.assertEqual(table["capitalCents"], "1200000")

    def test_quota_value_bare_percent_keeps_partner_name(self):
        text = (
            "A sociedade passa a ter o capital social R$ 1.000,00, dividido em 1.000 quotas.\n"
            "SÃ³cio Qdade de Quotas Valor %\n"
            "Natasha Basilio Teixeira Correia Furtado 1.000 R$ 1.000,00 100\n"
        )
        table = corpus.read_tables(text)
        self.assertEqual(table["rows"][0]["name"], "NATASHA BASILIO TEIXEIRA CORREIA FURTADO")
        self.assertEqual(table["rows"][0]["percentageBps"], 10000)

    def test_percent_first_integer_reais_table(self):
        text = (
            "O capital social Ã© de R$ 200.000,00 representado por 200.000 quotas.\n"
            "SÃ“CIOS % NÂº de Quotas Capital Social (R$)\n"
            "RUBENS NAMIR CASTELO BRANCO DE LIMA 70,00 140.000 140.000\n"
            "LUIZ BRUNO OLIVEIRA BUCAR 15,00 30.000 30.000\n"
            "JONATHAN DE ABREU FARIAS 15,00 30.000 30.000\n"
            "Total do Capital 100 200.000,00 200.000,00\n"
        )
        table = corpus.read_tables(text)
        self.assertEqual(table["capitalCents"], "20000000")
        self.assertEqual([row["percentageBps"] for row in table["rows"]], [7000, 1500, 1500])
        self.assertEqual(sum(row["amount"] for row in table["rows"]), 20000000)

    def test_total_percent_with_one_decimal_and_space(self):
        text = (
            "O capital social Ã© de R$ 5.000,00 dividido em 5.000 quotas.\n"
            "| SÃ“CIO | COTAS | PARTICIPAÃ‡ÃƒO % | INTEGRALIZADO | INTEGRALIZADO |\n"
            "|---|---|---|---|---|\n"
            "| JANE MARIA PONTE MARTINS | 4.950 | 99,0% | R$ | 4.950,00 |\n"
            "| TATYANE MARTINS GONÃ‡ALVES | 50 | 1% | | R$ 50,00 |\n"
            "| TOTAL | 5.000 | 100,0 % | R$ | 5.000,00 |\n"
        )
        table = corpus.read_tables(text)
        self.assertEqual(table["capitalCents"], "500000")
        self.assertEqual([row["percentageBps"] for row in table["rows"]], [9900, 100])

    def test_corporate_partner_suffix_wrapped_across_page(self):
        text = (
            "O capital social Ã© de R$ 200.000,00 dividido em 200.000 quotas.\n"
            "SÃ³cio NÂº de\nQuotas Valor\n"
            "NOHLIUG HOLDING DE EMPREENDIMENTOS GASTRONÃ”MICOS 200.000 R$ 200.000,00\n"
            "LTDA\nTotal 200.000 R$ 200.000,00\n"
        )
        table = corpus.read_tables(text)
        self.assertEqual(table["rows"][0]["name"],
                         "NOHLIUG HOLDING DE EMPREENDIMENTOS GASTRONOMICOS LTDA")
        self.assertEqual(table["rows"][0]["percentageBps"], 10000)

    def test_inconsistent_printed_total_recovers_names_only(self):
        text = (
            "CNPJ 11.072.882/0001-17.\n"
            "O capital social passa a ser R$ 32.000,00 dividido em 32.000 quotas, "
            "ficando distribuÃ­do entre os sÃ³cios da seguinte maneira:\n"
            "SÃ³cio Quotas % Valor(R$)\n"
            "FRANCISCO WELLINGTON FERNANDES 30.000 93,75% 30.000,00\n"
            "MARIA ZILDA VASCONCELOS FERNANDES 2.000 6,25% 2.000,00\n"
            "TOTAL 100.000 100% 100.000,00\n"
        )
        table = corpus.recover_inconsistent_total_names(text)
        self.assertIsNotNone(table)
        self.assertEqual(table["capitalCents"], "3200000")
        source = self.source("a", "aditivo.pdf", text)
        result = corpus.consolidate_documents(
            [source], "11072882000117", "AUTOMOTIVAS TINTAS LTDA", [],
            lambda *_: (_ for _ in ()).throw(ValueError("incompleto")), extract.valid_cpf,
        )
        self.assertTrue(source["nameOnlyRepaired"])
        self.assertEqual(result["summary"]["snapshots"], 0)

    def test_ai_parser_feedback_can_normalize_explicit_prose_distribution(self):
        original_text = (
            "CNPJ: 00.000.000/0001-00\n"
            "Vigência: 01/02/2024\n"
            "Ordem: 1\n"
            "Capital social: R$ 100.000,00\n"
            "O contrato descreve a distribuição do capital em cláusulas, sem quadro."
        )
        recovered_text = original_text + (
            "\n| SOCIOS | QUOTAS | % | VALOR (R$) |\n"
            "| PESSOA TESTE | 100.000 | 100% | R$ 100.000,00 |\n"
            "| TOTAL | 100.000 | 100% | R$ 100.000,00 |\n"
        )
        source = self.source("recovery", "ALTERACAO CONTRATUAL.pdf", original_text)
        feedback = []

        def recover(document, parser_error):
            feedback.append((document["id"], parser_error))
            return recovered_text

        result = corpus.consolidate_documents(
            [source],
            "00000000000100",
            "EMPRESA TESTE LTDA",
            ["PESSOA TESTE"],
            extract.parse_document,
            extract.valid_cpf,
            known_people=[{
                "name": "PESSOA TESTE",
                "cpf": "52998224725",
                "partnerCnpj": None,
                "birthDate": "1980-01-01",
            }],
            recover_document=recover,
        )

        self.assertEqual(len(feedback), 1)
        self.assertIn("quadro completo", feedback[0][1])
        self.assertEqual(result["summary"]["snapshots"], 1)
        self.assertEqual(result["partners"][0]["ownershipHistory"][0]["percentageBps"], 10000)
        self.assertIn("reanalisada pela IA", result["documents"][0]["issues"][-1])

    def test_ai_recovery_revalidates_table_with_inconsistent_printed_total(self):
        original_text = (
            "CNPJ: 00.000.000/0001-00\n"
            "Vigência: 01/02/2024\n"
            "Capital social: R$ 100.000,00\n"
            "Sócios Quotas % Valor(R$)\n"
            "PESSOA TESTE A 50.000 50% 50.000,00\n"
            "PESSOA TESTE B 50.000 50% 50.000,00\n"
            "TOTAL 100.000 100% 99.999,99\n"
        )
        recovered_text = original_text.replace("99.999,99", "100.000,00")
        source = self.source("recovery-total", "ADITIVO.pdf", original_text)
        recovery_count = 0

        def recover(_document, _parser_error):
            nonlocal recovery_count
            recovery_count += 1
            return recovered_text

        result = corpus.consolidate_documents(
            [source],
            "00000000000100",
            "EMPRESA TESTE LTDA",
            ["PESSOA TESTE A", "PESSOA TESTE B"],
            extract.parse_document,
            extract.valid_cpf,
            known_people=[
                {"name": "PESSOA TESTE A", "cpf": "52998224725", "birthDate": "1980-01-01"},
                {"name": "PESSOA TESTE B", "cpf": "11144477735", "birthDate": "1981-01-01"},
            ],
            recover_document=recover,
        )

        self.assertEqual(recovery_count, 1)
        self.assertEqual(result["summary"]["snapshots"], 1)
        self.assertTrue(all(partner["ownershipHistory"] for partner in result["partners"]))

    def test_ai_recovery_does_not_turn_qsa_names_into_ownership_percentages(self):
        qsa_text = (
            "Consulta Quadro de Sócios e Administradores - QSA\n"
            "CNPJ: 00.000.000/0001-00\n"
            "NOME EMPRESARIAL: EMPRESA TESTE LTDA\n"
            "CAPITAL SOCIAL: R$ 100.000,00\n"
            "Nome/Nome Empresarial: PESSOA TESTE A\n"
            "Qualificação: Sócio-Administrador\n"
            "Nome/Nome Empresarial: PESSOA TESTE B\n"
            "Qualificação: Sócio\n"
            "Para informações relativas à participação no QSA, acessar o e-CAC.\n"
        )
        source = self.source("qsa-text", "QSA.pdf", qsa_text)
        result = corpus.consolidate_documents(
            [source],
            "00000000000100",
            "EMPRESA TESTE LTDA",
            ["PESSOA TESTE A", "PESSOA TESTE B"],
            extract.parse_document,
            extract.valid_cpf,
            known_people=[
                {"name": "PESSOA TESTE A", "cpf": "52998224725", "birthDate": "1980-01-01"},
                {"name": "PESSOA TESTE B", "cpf": "11144477735", "birthDate": "1981-01-01"},
            ],
            recover_document=lambda _source, _error: qsa_text,
        )

        self.assertEqual(result["summary"]["snapshots"], 0)
        self.assertTrue(all(not partner["ownershipHistory"] for partner in result["partners"]))

    def test_explicit_unipersonal_owner_requires_matching_cnpj(self):
        text = (
            "AUTO LOCAÃ‡ÃƒO BB LTDA, CNPJ 69.369.262/0001-24. "
            "O capital ficou distribuÃ­do para o sÃ³cio TIAGO VASCONCELOS FERNANDES, "
            "tornando a Sociedade Limitada Unipessoal."
        )
        self.assertEqual(extract.explicit_unipersonal_owner(text, "69369262000124"),
                         "TIAGO VASCONCELOS FERNANDES")
        self.assertIsNone(extract.explicit_unipersonal_owner(text, "11111111000111"))

    def test_singular_socio_header_with_numero_de_quotas(self):
        text = (
            "O capital social Ã© de R$ 1.000,00 dividido em 1.000 quotas.\n"
            "| SÃ³cio                          |   NÂº de Quotas | Valor       |\n"
            "|--------------------------------|----------------|-------------|\n"
            "| PRISCILLA COSTA LIMA DE AQUINO |            500 | R$ 500,00   |\n"
            "| ALEX SANDRO PEREIRA MOREIRA    |            500 | R$ 500,00   |\n"
            "| Total                          |          1.000 | R$ 1.000,00 |\n"
        )
        table = corpus.read_tables(text)
        self.assertEqual(table["capitalCents"], "100000")
        self.assertEqual({row["name"] for row in table["rows"]},
                         {"PRISCILLA COSTA LIMA DE AQUINO", "ALEX SANDRO PEREIRA MOREIRA"})

    def test_one_real_capital_discrepancy_is_names_only(self):
        text = (
            "CNPJ 26.674.814/0001-03.\n"
            "O sÃ³cio FRANCISCO ALDAIRTON RIBEIRO CARVALHO JUNIOR estÃ¡ qualificado.\n"
            "ApÃ³s as alteraÃ§Ãµes, o Capital Social que Ã© de R$ 120.000,00 fica "
            "distribuÃ­do entre os sÃ³cios da seguinte forma:\n\n"
            "| SÃ“CIO                                 |   QUOTAS | %      | VALOR(R$)   |\n"
            "|---------------------------------------|----------|--------|-------------|\n"
            "| NILO DE MORAES BRITTO NETO            |   40.000 | 33,33% | 40.000,00   |\n"
            "| MARCOS SANTOS BARROS LEAL             |   40.000 | 33,33% | 40.000,00   |\n"
            "| FCO ALDAIRTON RIBEIRO CARVALHO JUNIOR |   26.666 | 22,22% | 26.666,00   |\n"
            "| LUIS ANDRÃ‰ NOBREGA BASTOS             |   13.333 | 11,12% | 13.333,00   |\n"
            "| TOTAL                                 |  120.000 | 100%   | 120.000,00  |\n"
        )
        with self.assertRaisesRegex(ValueError, "quadro nÃ£o fecha no capital"):
            corpus.read_tables(text)
        source = self.source("a", "aditivo.pdf", text)
        result = corpus.consolidate_documents(
            [source], "26674814000103", "ARBORA NEGOCIOS E PARTICIPACOES LTDA", [],
            lambda *_: (_ for _ in ()).throw(ValueError("incompleto")), extract.valid_cpf,
        )
        self.assertTrue(source["nameOnlyRepaired"])
        self.assertEqual(result["summary"]["snapshots"], 0)
        self.assertEqual(len(source["table"]["rows"]), 4)
        self.assertIn("FRANCISCO ALDAIRTON RIBEIRO CARVALHO JUNIOR",
                      {row["name"] for row in source["table"]["rows"]})

    def test_vertical_table_cells_from_pdf_are_combined(self):
        text = (
            "O capital serÃ¡ de R$ 1.000,00, dividido em 1000 quotas.\n"
            "Nome do SÃ³cio\nQtd Quotas\nValor Em R$\n%\n"
            "AURECINA MORAIS\n1000\n1.000,00\n100,00\n"
            "TOTAL:\n1000\n1.000,00\n100,00\n"
        )
        table = corpus.read_tables(text)
        self.assertEqual(table["capitalCents"], "100000")
        self.assertEqual(table["rows"][0]["name"], "AURECINA MORAIS")
        self.assertEqual(table["rows"][0]["percentageBps"], 10000)

    def test_numeric_cell_is_not_accepted_as_partner_name(self):
        self.assertIsNone(corpus._parse_table_row("10.000 10.000 50% 10.000,00", 2000000))

    def test_numeric_ocr_cell_recovers_name_only_with_unique_qsa_match(self):
        text = (
            "| CNAE | Qtde | Ano | Valor |\n| 12345 | 1 | 2020 | 1,00 |\n"
            "O capital social Ã© de R$ 20.000,00.\n"
            "| SÃ³cios | Quotas | % | Valor(R$) |\n"
            "|-----|-----|-----|-----|\n"
            "| 10.000 | 10.000 | 10.000,00 | 10.000,00 |\n"
            "| JOAQUIM JOSÃ‰ BARBOSA | 10.000 | | 10.000,00 |\n"
            "| TOTAL | 20.000 | 100% | 20.000,00 |\n"
            "AdministraÃ§Ã£o exercida por QEURIS SOUTO ALVES e JOAQUIM JOSÃ‰ BARBOSA.\n"
        )
        hints = ["QEURIS SOUTO ALVES", "JOAQUIM JOSE BARBOSA"]
        repaired = corpus.repair_numeric_partner_cell(text, hints)
        self.assertEqual(repaired[1], "QEURIS SOUTO ALVES")
        table = corpus.read_tables(repaired[0])
        self.assertEqual({row["name"] for row in table["rows"]}, set(hints))
        self.assertEqual([row["percentageBps"] for row in table["rows"]], [5000, 5000])
        self.assertIsNone(corpus.repair_numeric_partner_cell(text, ["QEURIS SOUTO ALVES", "OUTRA PESSOA"]))

    def test_repaired_ocr_name_does_not_create_ownership_history(self):
        text = (
            "Empresa TESTE LTDA CNPJ 12.345.678/0001-90. Capital social R$ 20.000,00.\n"
            "| SÃ³cios | Quotas | % | Valor(R$) |\n"
            "|-----|-----|-----|-----|\n"
            "| 10.000 | 10.000 | 10.000,00 | 10.000,00 |\n"
            "| JOAQUIM JOSE BARBOSA | 10.000 | | 10.000,00 |\n"
            "| TOTAL | 20.000 | 100% | 20.000,00 |\n"
        )
        source = {"id": "pdf", "name": "aditivo.pdf", "hash": "a" * 64,
                  "text": text, "createdTime": "2025-01-01T00:00:00Z"}
        result = corpus.consolidate_documents(
            sources=[source],
            company_cnpj="12345678000190", company_name="TESTE LTDA", known_names=[],
            parse_document=lambda *_: (_ for _ in ()).throw(ValueError("sem identidade")),
            valid_cpf=extract.valid_cpf, trusted_folder=True,
            qsa_names=["QEURIS SOUTO ALVES", "JOAQUIM JOSE BARBOSA"],
        )
        self.assertEqual(result["summary"]["snapshots"], 0)
        self.assertTrue(source["nameOnlyRepaired"])
        self.assertEqual({row["name"] for row in source["table"]["rows"]},
                         {"QEURIS SOUTO ALVES", "JOAQUIM JOSE BARBOSA"})

    def test_table_accepts_spaces_around_thousands_separator(self):
        table = corpus.read_tables(
            "Capital social R$ 60.000,00\n"
            "SÃ³cios Quotas % Valor(R$)\n"
            "Antonio Teles Frota Junior 30 .000 50% 30 .000,00\n"
            "Antonio Yuri Landim Torquato 30 .000 50% 30 .000,00\n"
            "TOTAL 60.000 100,00% 60.000,00\n"
        )
        self.assertEqual(len(table["rows"]), 2)
        self.assertEqual(sum(row["percentageBps"] for row in table["rows"]), 10000)

    def test_bundled_amendments_use_last_complete_ocr_table(self):
        text = (
            "1o ADITIVO AO CONTRATO SOCIAL\n"
            "Capital social: R$ 10.000,00\n"
            "SOCIOS QUOTAS % VALOR\n"
            "ALFA TESTE 10.000 100% 10.000,00\n"
            "TOTAL 10.000 100% 10.000,00\n"
            "2o ADITIVO AO CONTRATO SOCIAL\n"
            "Clausula segunda: O socio administrador, agora unico socio, aumenta "
            "o capital social para R$ 100.000,00, ficando distribuido:\n"
            "| JOSE MARDILSON BEZERRA DE MORAES 100% | 100.000quotas | RS 1,00 | R$ 100.000,00 |\n"
            "|-----------------------------------------|-----------------|-----------|-----------------|\n"
            "| TOTAL | 100.000quotas | RS 1,00 | R$ 100.000,00 |\n"
        )
        result = corpus.read_tables(text)
        self.assertEqual(result["capitalCents"], "10000000")
        self.assertEqual(result["rows"][0]["name"], "JOSE MARDILSON BEZERRA DE MORAES")
        self.assertEqual(result["rows"][0]["percentageBps"], 10000)
        self.assertEqual(result["rows"][0]["amount"], 10000000)

    def test_qualification_accepts_colon_and_parenthetical_gender_from_ocr(self):
        text = (
            "MARCOS INACIO GAZARRA TARTAGLIONE, nacionalidade: brasileira, "
            "nascido(a) em: 17/05/1964, n\u00ba do documento RG 641769647, "
            "n\u00ba do CPF: 33696357472."
        )
        people = corpus.qualification(text, "MARCOS INACIO GAZARRA TARTAGLIONE", extract.valid_cpf)
        self.assertEqual(len(people), 1)
        self.assertEqual(people[0]["cpf"], "33696357472")
        self.assertEqual(people[0]["birthDate"], "1964-05-17")

    def test_qualification_accepts_city_phrase_and_rejects_impossible_minor_date(self):
        text = (
            "ANTONIO TELES FROTA JUNIOR, brasileiro, solteiro, maior, nascido na cidade "
            "de Sobral, Estado do Ceara, em 25/10/1968, inscrito no CPF sob "
            "447.387.303-04. "
            "ANTONIO TELES FROTA JUNIOR, brasileiro, solteiro, maior, nascido na cidade "
            "de Sobral, Estado do Ceara, em 25/10/2012, inscrito no CPF sob "
            "447.387.303-04."
        )
        people = corpus.qualification(text, "ANTONIO TELES FROTA JUNIOR", extract.valid_cpf)
        births = {person["birthDate"] for person in people if person["birthDate"]}
        self.assertEqual(births, {"1968-10-25"})

    def test_junta_registration_date_is_an_explicit_document_date(self):
        text = (
            "Certifico registro sob o nÂº 5383470 em 28/01/2020 da Empresa "
            "EMPRESA TESTE LTDA"
        )
        self.assertEqual(corpus.explicit_date(text), "2020-01-28")

    def source(self, id_, name, text, created_time="2024-01-01T00:00:00Z"):
        return {
            "id": id_,
            "name": name,
            "text": text,
            "hash": (id_[0] * 64)[:64],
            "createdTime": created_time,
        }

    def test_table_without_percentage_column_or_total_percentage(self):
        text = (
            "SÃ“CIOS QUOTAS VALOR(R$)\n"
            "PESSOA TESTE A 60 60.000,00\n"
            "PESSOA TESTE B 40 40.000,00\n"
            "TOTAL 100 100.000,00\n"
        )
        table = corpus.read_tables(text)
        self.assertEqual(table["capitalCents"], "10000000")
        self.assertEqual([row["percentageBps"] for row in table["rows"]], [6000, 4000])

    def test_table_with_participacao_header_and_pipes(self):
        text = (
            "SÃ“CIOS | NÂº DE QUOTAS | PARTICIPAÃ‡ÃƒO | VALOR TOTAL\n"
            "PESSOA TESTE A | 60 | 60% | R$ 60.000,00\n"
            "PESSOA TESTE B | 40 | 40% | R$ 40.000,00\n"
            "TOTAL | 100 | 100% | R$ 100.000,00\n"
        )
        table = corpus.read_tables(text)
        self.assertEqual(table["capitalCents"], "10000000")
        self.assertEqual([row["percentageBps"] for row in table["rows"]], [6000, 4000])

    def test_percentage_after_value_accepts_dot_decimal_from_pdf(self):
        text = (
            "SÃ“CIOS QUOTAS VALOR %\n"
            "EDGAR FERREIRA BARROS JUNIOR 39.400 R$ 39.400,00 50,00 %\n"
            "PATRICIA MARIA MONTENEGRO BARREIRA 19.700 R$ 19.700,00 25.00 %\n"
            "LEONARDO MONTENEGRO BARREIRA 19.700 R$ 19.700,00 25.00 %\n"
            "TOTAL 78.800 R$ 78.800,00 100,00\n"
        )
        table = corpus.read_tables(text)
        self.assertEqual(table["capitalCents"], "7880000")
        self.assertEqual([row["percentageBps"] for row in table["rows"]], [5000, 2500, 2500])

    def test_table_header_split_across_lines_and_without_percent_column(self):
        text = (
            "QUADRO SOCIETÃRIO\n"
            "SÃ“CIOS\n"
            "COTAS\n"
            "VALOR DO CAPITAL (R$)\n"
            "PESSOA TESTE A 75 75.000,00\n"
            "PESSOA TESTE B 25 25.000,00\n"
            "TOTAL 100 100.000,00\n"
        )
        table = corpus.read_tables(text)
        self.assertEqual(table["capitalCents"], "10000000")
        self.assertEqual([row["percentageBps"] for row in table["rows"]], [7500, 2500])

    def test_contract_without_cnpj_can_bind_by_explicit_company_title(self):
        text = "CONTRATO DE CONSTITUIÃ‡ÃƒO DA EMPRESA TESTE LTDA\nClÃ¡usulas sociais."
        self.assertEqual(corpus.company_binding(text, "00000000000100", "EMPRESA TESTE LTDA"), "company-name")
        self.assertIsNone(corpus.company_binding(text, "00000000000100", "OUTRA EMPRESA LTDA"))

    def test_exact_legal_name_in_trusted_folder_can_bind_a_sibling_branch_cnpj(self):
        text = (
            "CNPJ: 46.961.423/0001-79\n"
            "2Âº ADITIVO CONTRATUAL\n"
            "CELERE TECNOLOGIA E ASSESSORIA EM SAUDE PUBLICA E PRIVADA LTDA\n"
            "QUADRO SOCIETARIO CAPITAL SOCIAL"
        )
        self.assertEqual(
            corpus.company_binding(text, "46961423000250",
                                   "CELERE TECNOLOGIA E ASSESSORIA EM SAUDE PUBLICA E PRIVADA LTDA",
                                   trusted_folder=True),
            "company-name-cross-branch",
        )
        self.assertIsNone(corpus.company_binding(
            text, "46961423000250",
            "CELERE TECNOLOGIA E ASSESSORIA EM SAUDE PUBLICA E PRIVADA LTDA",
        ))

    def test_qualification_stops_at_semicolon_and_accepts_missing_comma(self):
        text = (
            "ANGELA MARIA DE CARVALHO ARNALDO, brasileira, nascida em 16/09/1954, "
            "inscrita no CPF (MF) nÂº 082.363.618-61; "
            "TISSIANO CARVALHO CORTIZO brasileiro, nascido em 31/03/1976, "
            "inscrito no CPF (MF) nÂº 675.092.903-68."
        )
        angela = corpus.qualification(text, "ANGELA MARIA DE CARVALHO ARNALDO", extract.valid_cpf)
        tissiano = corpus.qualification(text, "TISSIANO CARVALHO CORTIZO", extract.valid_cpf)
        self.assertEqual({person["cpf"] for person in angela}, {"08236361861"})
        self.assertEqual({person["cpf"] for person in tissiano}, {"67509290368"})

    def test_personal_fields_are_completed_and_missing_vigencia_uses_drive_created_time(self):
        dated = self.source("a", "ALTERACAO CONTRATUAL.pdf", (
            "CNPJ: 00.000.000/0001-00\n"
            "VigÃªncia: 01/02/2024\n"
            "SÃ“CIOS QUOTAS VALOR(R$)\n"
            "PESSOA TESTE 100 100.000,00\n"
            "TOTAL 100 100.000,00\n"
        ))
        cpf_only = self.source("b", "CONTRATO SOCIAL.pdf", (
            "CONTRATO SOCIAL DA EMPRESA TESTE LTDA\n"
            "PESSOA TESTE, brasileira, inscrita no CPF sob NÂº 529.982.247-25.\n"
            "SÃ“CIOS QUOTAS VALOR(R$)\n"
            "PESSOA TESTE 100 100.000,00\n"
            "TOTAL 100 100.000,00\n"
        ), "2023-05-10T14:30:00Z")
        birth_only = self.source("c", "CONSTITUICAO COMPLEMENTO.pdf", (
            "INSTRUMENTO PARTICULAR DE CONSTITUIÃ‡ÃƒO DA EMPRESA TESTE LTDA\n"
            "PESSOA TESTE, brasileira, nascida em 01/01/1980, residente nesta cidade.\n"
        ))

        result = corpus.consolidate_documents(
            [dated, cpf_only, birth_only],
            "00000000000100",
            "EMPRESA TESTE LTDA",
            [],
            extract.parse_document,
            extract.valid_cpf,
        )

        self.assertEqual(result["mode"], "document-set")
        self.assertEqual(result["summary"]["snapshots"], 2)
        self.assertEqual(len(result["partners"]), 1)
        partner = result["partners"][0]
        self.assertEqual(partner["cpf"], "52998224725")
        self.assertEqual(partner["birthDate"], "1980-01-01")
        self.assertEqual(len(partner["ownershipHistory"]), 2)
        self.assertEqual(
            [event["effectiveAt"] for event in partner["ownershipHistory"]],
            ["2023-05-10", "2024-02-01"],
        )
        self.assertTrue(all(event["percentageBps"] == 10000 for event in partner["ownershipHistory"]))
        cpf_report = next(item for item in result["documents"] if item["sourceFileId"] == "b")
        self.assertEqual(cpf_report["status"], "snapshot")
        self.assertTrue(any("data de upload/criaÃ§Ã£o no Drive" in issue for issue in cpf_report["issues"]))
        self.assertTrue(any("data de upload/criaÃ§Ã£o no Drive" in warning for warning in result["warnings"]))

    def test_multiple_explicit_effective_dates_use_the_most_recent(self):
        text = (
            "VigÃªncia: 01/02/2024\n"
            "ProduzirÃ¡ efeitos a partir de 15/03/2024\n"
            "InÃ­cio dos efeitos do registro: 10/01/2024\n"
        )
        self.assertEqual(corpus.explicit_date(text), "2024-03-15")

    def test_qualification_accepts_birth_date_written_in_portuguese(self):
        text = (
            "ANA LUIZA CARACAS DE SOUZA, brasileira, nascida na cidade de Recife - "
            "Pernambuco, em16 de Janeiro de 1964, inscrita no CPF sob n 317.676.213-53."
        )
        people = corpus.qualification(
            text, "ANA LUIZA CARACAS DE SOUZA", extract.valid_cpf,
        )
        self.assertEqual(people[0]["cpf"], "31767621353")
        self.assertEqual(people[0]["birthDate"], "1964-01-16")

    def test_database_identity_can_complete_partner_present_in_document_table(self):
        source = self.source("a", "ALTERACAO CONTRATUAL.pdf", (
            "CNPJ: 00.000.000/0001-00\nVigÃªncia: 01/02/2024\n"
            "SÃ“CIOS QUOTAS VALOR(R$)\n"
            "PESSOA TESTE 100 100.000,00\nTOTAL 100 100.000,00\n"
        ))
        result = corpus.consolidate_documents(
            [source], "00000000000100", "EMPRESA TESTE LTDA", ["PESSOA TESTE"],
            extract.parse_document, extract.valid_cpf,
            known_people=[{
                "name": "PESSOA TESTE", "cpf": "52998224725",
                "partnerCnpj": None, "birthDate": "1980-01-01",
            }],
        )
        self.assertEqual(result["partners"][0]["cpf"], "52998224725")
        self.assertEqual(result["partners"][0]["ownershipHistory"][0]["percentageBps"], 10000)

    def test_drive_created_time_fallback_uses_date_part(self):
        self.assertEqual(corpus.drive_created_date("2026-09-18T17:42:31.123Z"), "2026-09-18")
        with self.assertRaises(ValueError):
            corpus.drive_created_date(None)


if __name__ == "__main__":
    unittest.main()


def test_junta_ce_header_after_prose_is_not_skipped():
    text = """
CLÃUSULA PRIMEIRA â€“ ALTERAÃ‡ÃƒO DE QUADRO SOCIETARIO
Ingressa na sociedade o sÃ³cio WILLAMES CLAY MACHADO AGUIAR, brasileiro,
adicionando R$ 10.000,00 constituÃ­do de 10.000 quotas no valor nominal de R$ 1,00 cada.
CLÃUSULA SEGUNDA - CAPITAL SOCIAL
ApÃ³s as alteraÃ§Ãµes acima mencionadas, o capital social passa a ser R$ 20.000,00
em 20.000 quotas no valor nominal de R$ 1,00 cada, ficando distribuÃ­do da seguinte forma:
SÃ“CIOS Quotas % Valor (R$)
FRANCISCO ORLANDO SILVEIRA PEREIRA 10.000 50% 10.000,00
WILLAMES CLAY MACHADO AGUIAR 10.000 50% 10.000,00
TOTAL 20.000 100% 20.000,00
CLÃUSULA TERCEIRA â€“ ADMINISTRAÃ‡ÃƒO
"""
    snapshot = corpus.read_tables(text)
    assert snapshot["capitalCents"] == "2000000"
    assert [row["percentageBps"] for row in snapshot["rows"]] == [5000, 5000]
    assert [row["quotas"] for row in snapshot["rows"]] == [10000, 10000]


def test_contractual_prose_is_not_a_table_header():
    text = """
A responsabilidade de cada sÃ³cio Ã© restrita ao valor de suas quotas, mas todos respondem
solidariamente pela integralizaÃ§Ã£o do capital social.
Os lucros serÃ£o distribuÃ­dos aos sÃ³cios na proporÃ§Ã£o da participaÃ§Ã£o de cada um no capital social.
"""
    try:
        corpus.read_tables(text)
    except ValueError as error:
        assert "nenhum cabeÃ§alho societÃ¡rio reconhecÃ­vel" in str(error)
    else:
        raise AssertionError("ordinary contractual prose must not be treated as a table")


def test_aditivo_without_company_cnpj_can_bind_by_exact_company_name_even_with_partner_cnpj():
    text = """
    5Âº ADITIVO - INSTRUMENTO DE ALTERAÃ‡ÃƒO DO CONTRATO SOCIAL
    EMPRESA TESTE LTDA
    Ingressa o sÃ³cio HOLDING PARCEIRA LTDA, CNPJ 11.111.111/0001-11.
    CLÃUSULA DE CAPITAL SOCIAL
    """
    assert corpus.company_binding(text, "00000000000100", "EMPRESA TESTE LTDA") == "company-name"


def test_rounded_percentages_within_one_basis_point_are_accepted():
    text = """
    SÃ“CIOS QUOTAS % VALOR(R$)
    PESSOA A 100 33,33% 100,00
    PESSOA B 100 33,33% 100,00
    PESSOA C 100 33,34% 100,00
    TOTAL 300 100% 300,00
    """
    table = corpus.read_tables(text)
    assert [row["percentageBps"] for row in table["rows"]] == [3333, 3333, 3334]


def test_total_do_capital_social_is_recognized():
    text = """
    SÃ“CIOS QUOTAS % VALOR(R$)
    PESSOA A 60 60% 60.000,00
    PESSOA B 40 40% 40.000,00
    TOTAL DO CAPITAL SOCIAL 100 100% 100.000,00
    """
    table = corpus.read_tables(text)
    assert table["capitalCents"] == "10000000"


def test_table_without_recognized_header_can_be_recovered_from_distribution_and_total():
    text = """
    CLÃUSULA SEGUNDA - CAPITAL SOCIAL
    O capital social Ã© de R$ 100.000,00, ficando distribuÃ­do da seguinte forma:
    PESSOA A 60 60% 60.000,00
    PESSOA B 40 40% 40.000,00
    TOTAL 100 100% 100.000,00
    CLÃUSULA TERCEIRA - ADMINISTRAÃ‡ÃƒO
    """
    table = corpus.read_tables(text)
    assert [row["name"] for row in table["rows"]] == ["PESSOA A", "PESSOA B"]


def test_header_table_without_total_uses_nearby_declared_capital():
    text = """
    CLÃUSULA SEGUNDA - CAPITAL SOCIAL
    O capital social passa a ser R$ 100.000,00.
    SÃ“CIOS QUOTAS % VALOR(R$)
    PESSOA A 60 60% 60.000,00
    PESSOA B 40 40% 40.000,00
    CLÃUSULA TERCEIRA - ADMINISTRAÃ‡ÃƒO
    """
    table = corpus.read_tables(text)
    assert table["capitalCents"] == "10000000"
    assert sum(row["percentageBps"] for row in table["rows"]) == 10000
