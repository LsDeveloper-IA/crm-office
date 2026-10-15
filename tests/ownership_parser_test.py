import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("extract", Path(__file__).parents[1] / "scripts/ownership/extract.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ParserTest(unittest.TestCase):
    def test_console_streams_are_configured_for_utf8_without_encoding_crashes(self):
        stdout = Mock()
        stderr = Mock()
        with patch.object(sys, "stdout", stdout), patch.object(sys, "stderr", stderr):
            module.configure_console_encoding()

        stdout.reconfigure.assert_called_once_with(
            encoding="utf-8", errors="backslashreplace"
        )
        stderr.reconfigure.assert_called_once_with(
            encoding="utf-8", errors="backslashreplace"
        )

    def document(self, percentage="100,00"):
        return ("CNPJ: 00.000.000/0001-00\nVigência: 01/02/2024\nOrdem: 1\nCapital social: R$ 100.000,00\n"
                f"Sócio: Pessoa Teste; CPF: 529.982.247-25; Nascimento: 01/01/1980; Participação: {percentage}%")

    def test_extract(self):
        result = module.parse_document(self.document(), "file", "a" * 64)
        self.assertEqual(result['effectiveAt'], '2024-02-01')
        self.assertEqual(result['capitalCents'], '10000000')
        self.assertEqual(result['partners']['52998224725']['birthDate'], '1980-01-01')

    def test_reject_incomplete_and_ambiguous(self):
        for text in (self.document("50,00"), self.document() + "\nVigência: 02/02/2024",
                     self.document().replace("529.982.247-25", "111.111.111-11"), "PDF sem quadro"):
            with self.assertRaises(ValueError):
                module.parse_document(text, "file", "a" * 64)

class RegisteredAditivoTest(unittest.TestCase):
    def test_repeated_aditivo_references_do_not_select_lower_alteration_number(self):
        text = (
            "6” (SEXTO) ADITIVO. 7” aditivo. 002 ALTERAÇÃO CONTRATUAL.\n"
            "CNPJ: 00.000.000/0001-00\n"
            "PESSOA TESTE A, brasileiro, nascido em 01/02/1980, "
            "inscrito no CPF sob o Nº 529.982.247-25.\n"
            "SÓCIOS Quotas % Valor (R$)\n"
            "PESSOA TESTE A 8.000 100% 8.000,00\n"
            "TOTAL 8.000 100% 8.000,00\n"
            "Data de início dos efeitos: 07/04/2026\n"
        )
        result = module.parse_document(text, "sequence-regression", "a" * 64)

        self.assertEqual(result["sequence"], 7)
        self.assertEqual(result["partners"]["52998224725"]["percentageBps"], 10000)

    def test_reads_contabilus_registered_aditivo_model(self):
        text = ("4º(quarto) Aditivo - Instrumento de Alteração do Contrato Social.\n"
                "CONTABILUS TREINAMENTOS E TECNOLOGIA LTDA\n"
                "CNPJ: 29.173.768/0001-49\n"
                "FRANCISCO ORLANDO SILVEIRA PEREIRA, brasileiro, nascido em 28/05/1969, "
                "inscrito no CPF(MF) sob o Nº 389.256.643-72.\n"
                "WILLAMES CLAY MACHADO AGUIAR, brasileiro, nascido em 12/02/1979, "
                "inscrito no CPF sob o Nº 888.399.153-20.\n"
                "SÓCIOS Quotas % Valor (R$)\n"
                "FRANCISCO ORLANDO SILVEIRA PEREIRA 10.000 50% 10.000,00\n"
                "WILLAMES CLAY MACHADO AGUIAR 10.000 50% 10.000,00\n"
                "TOTAL 20.000 100% 20.000,00\n"
                "Data de início dos efeitos do registro (art. 36, Lei 8.934/1994): 18/09/2023\n")
        result = module.parse_document(text, "contabilus", "a" * 64)
        self.assertEqual(result["companyCnpj"], "29173768000149")
        self.assertEqual(result["effectiveAt"], "2023-09-18")
        self.assertEqual(result["sequence"], 4)
        self.assertEqual(result["partners"]["38925664372"]["birthDate"], "1969-05-28")
        self.assertEqual(result["partners"]["88839915320"]["percentageBps"], 5000)

    def test_accepts_effects_date_and_table_header_variants(self):
        text = ("4 ADITIVO\nCNPJ: 29.173.768/0001-49\n"
                "FRANCISCO ORLANDO SILVEIRA PEREIRA, brasileiro, CPF sob Nº 389.256.643-72.\n"
                "WILLAMES CLAY MACHADO AGUIAR, brasileiro, CPF sob Nº 888.399.153-20.\n"
                "SÓCIOS\nQUOTAS\n%\nVALOR(R$)\n"
                "FRANCISCO ORLANDO SILVEIRA PEREIRA 10.000 50% 10.000,00\n"
                "WILLAMES CLAY MACHADO AGUIAR 10.000 50% 10.000,00\n"
                "TOTAL 20.000 100% 20.000,00\n"
                "Data de início dos efeitos: 18/09/2023\n")
        result = module.parse_document(text, "variant", "a" * 64)
        self.assertEqual(result["effectiveAt"], "2023-09-18")
        self.assertEqual(len(result["partners"]), 2)

    def test_corporate_partner_does_not_inherit_representatives_cpf(self):
        text = ("8” (OITAVO) ADITIVO\nCNPJ: 00.000.000/0001-00\n"
                "PESSOA TESTE A, brasileiro, nascido em 01/02/1980, CPF de N” 529.982.247-25.\n"
                "PESSOA TESTE B, brasileira, nascida em 03/04/1985, CPF de N” 111.444.777-35.\n"
                "Retira-se da sociedade o sócio PESSOA TESTE A, já qualificado acima, titular de R$28.000,00 cedendo suas quotas.\n"
                "Retira-se da sociedade a sócia PESSOA TESTE B, já qualificada acima, titular de R$28.000,00 cedendo suas quotas.\n"
                "TESTE PARTICIPA˙ÕES LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob N” 12.345.678/0001-95, "
                "representada por PESSOA TESTE A, brasileiro, nascido em 01/02/1980, CPF de N” 529.982.247-25.\n"
                "SÓCIO QUOTAS % VALOR(R$)\nTESTE PARTICIPA˙ÕES LTDA 56.000 100% 56.000,00\n"
                "TOTAL 56.000 100% 56.000,00\n"
                "Data de início dos efeitos do registro (art. 36, Lei 8.934/1994): 25/02/2026\n")
        result = module.parse_document(text, "sample", "a" * 64)
        corporate = result['partners']['12345678000195']
        self.assertIsNone(corporate['cpf'])
        self.assertIsNone(corporate['birthDate'])
        self.assertEqual(corporate['percentageBps'], 10000)
        self.assertEqual(len(result['partners']), 3)
        former = result['partners']['52998224725']
        self.assertEqual(former['percentageBps'], 0)
        self.assertEqual(former['previousPercentageBps'], 5000)

    def document(self):
        return ("4º(quarto) Aditivo - Instrumento de Alteração\nCNPJ: 00.000.000/0001-00\n"
                "PESSOA TESTE A, brasileiro, nascido em 01/ 02/1980, inscrito no CPF(MF) sob o Nº 529.982.247- 25.\n"
                "PESSOA TESTE B, brasileira, nascida em 03/04/1985, inscrita no CPF sob o Nº 111.444.777-35.\n"
                "Sócios Quotas % Valor(R$)\n"
                "PESSOA TESTE A 10.000 50% 10.000,00\n"
                "PESSOA TESTE B 10.000 50% 10.000,00\n"
                "TOTAL 20.000 100% 20.000,00\n"
                "Cidade, 13 de julho de 2023\n"
                "Data de início dos efeitos do registro (art. 36, Lei 8.934/1994): 18/09/2023\n")

    def test_reads_qualifications_table_and_explicit_effective_date(self):
        result = module.parse_document(self.document(), "sample", "a" * 64)
        self.assertEqual(result['effectiveAt'], '2023-09-18')
        self.assertEqual(result['sequence'], 4)
        self.assertEqual(result['capitalCents'], '2000000')
        self.assertEqual(result['partners']['52998224725']['birthDate'], '1980-02-01')
        self.assertEqual(result['partners']['11144477735']['percentageBps'], 5000)

    def test_warns_about_printed_quota_total_without_changing_money(self):
        result = module.parse_document(self.document().replace('TOTAL 20.000', 'TOTAL 10.000'), "sample", "a" * 64)
        self.assertEqual(len(result['warnings']), 1)
        self.assertEqual(result['capitalCents'], '2000000')

    def test_rejects_conflicting_tables_missing_effective_date_and_bad_amounts(self):
        source = self.document()
        for text in (
            source.replace('Data de início dos efeitos do registro', 'Data de assinatura'),
            source.replace('50% 10.000,00', '40% 10.000,00', 1),
            source + 'Sócios Quotas % Valor(R$)\nPESSOA TESTE A 20.000 100% 20.000,00\nTOTAL 20.000 100% 20.000,00\n',
        ):
            with self.assertRaises(ValueError):
                module.parse_document(text, "sample", "a" * 64)


class DoclingMojibakeTableTest(unittest.TestCase):
    def test_reads_windows1252_mojibake_and_value_before_percentage(self):
        from scripts.ownership.corpus import read_tables
        text = (
            "Capital social: R$ 20.000,00\n"
            "| S\u00c3\u201cCIO | N\u00ba DE QUOTAS | VALOR | PERCENTUAL |\n"
            "|---|---|---|---|\n"
            "| MARCOS INACIO GAZARRA TARTAGLIONE | 20.000 | R$ 20.000,00 | 100,00% |\n"
            "| TOTAL | 20.000 | R$ 20.000,00 | 100,00% |\n"
        )
        result = read_tables(text)
        self.assertEqual(result["capitalCents"], "2000000")
        self.assertEqual(result["rows"][0]["name"], "MARCOS INACIO GAZARRA TARTAGLIONE")
        self.assertEqual(result["rows"][0]["percentageBps"], 10000)
        self.assertEqual(result["rows"][0]["amount"], 2000000)


class RecursiveDriveTest(unittest.TestCase):
    def test_only_ownership_related_files_are_text_candidates(self):
        files = [
            {"id": "generic", "name": "documento 001.pdf", "createdTime": "2025-01-01T00:00:00Z"},
            {"id": "photo", "name": "scan quadro societário.png", "createdTime": "2026-01-01T00:00:00Z"},
            {"id": "change", "name": "Alteração Contratual.pdf", "createdTime": "2024-01-01T00:00:00Z"},
            {"id": "tax", "name": "Guia de imposto.pdf", "createdTime": "2027-01-01T00:00:00Z"},
        ]
        self.assertEqual(
            [item["id"] for item in module.ownership_document_candidates(files)],
            ["change"],
        )
        with self.assertRaisesRegex(ValueError, "quadro societário"):
            module.ownership_document_candidates([files[0], files[3]])

    def test_identity_scan_named_rg_socio_is_not_a_corporate_source(self):
        files = [{"id": "identity", "name": "RG SOCIO.pdf",
                  "createdTime": "2025-01-01T00:00:00Z"}]
        with self.assertRaisesRegex(ValueError, "quadro societ"):
            module.ownership_document_candidates(files)

    def test_newest_registered_act_is_preferred_and_uses_id_tiebreaker(self):
        files = [
            {"id": "old", "name": "QSA.pdf", "createdTime": "2024-01-01T00:00:00Z"},
            {"id": "a", "name": "ALTERAÇÃO CONTRATUAL.pdf", "createdTime": "2025-01-01T00:00:00Z"},
            {"id": "b", "name": "QUADRO DE SÓCIOS.pdf", "createdTime": "2025-01-01T00:00:00Z"},
        ]
        self.assertEqual(module.ownership_document_candidates(files)[0]["id"], "a")
        with self.assertRaisesRegex(ValueError, "createdTime"):
            module.ownership_document_candidates([{"id": "bad", "name": "QSA.pdf"}])

    def test_registered_act_is_preferred_over_newer_receita_qsa(self):
        files = [
            {"id": "act", "name": "1 ADITIVO.pdf", "createdTime": "2024-02-27T12:22:21Z"},
            {"id": "qsa", "name": "QSA.pdf", "createdTime": "2024-02-27T12:23:23Z"},
        ]
        self.assertEqual(module.ownership_document_candidates(files)[0]["id"], "act")

    def test_highest_numbered_amendment_wins_and_lease_is_ignored(self):
        files = [
            {"id": "original", "name": "CONTRATO SOCIAL.pdf",
             "createdTime": "2025-01-01T00:00:00Z"},
            {"id": "lease", "name": "ADITIVO AO CONTRATO DE LOCACAO.pdf",
             "createdTime": "2026-01-01T00:00:00Z"},
            {"id": "four", "name": "4º ADITIVO EMPRESA.pdf",
             "createdTime": "2024-03-01T00:00:00Z"},
            {"id": "five", "name": "5º ADITIVO EMPRESA.pdf",
             "createdTime": "2024-01-01T00:00:00Z"},
        ]
        self.assertEqual([item["id"] for item in module.ownership_document_candidates(files)],
                         ["five", "four", "original"])

    def test_keeps_original_contract_and_latest_copy_of_each_numbered_amendment(self):
        files = [
            {"id": "base", "name": "CONTRATO SOCIAL EMPRESA.pdf", "createdTime": "2024-01-01T00:00:00Z"},
            {"id": "amend1-old", "name": "1 ADITIVO EMPRESA.pdf", "createdTime": "2024-02-01T00:00:00Z"},
            {"id": "amend1-copy", "name": "1 ADITIVO EMPRESA FINAL.pdf", "createdTime": "2024-02-02T00:00:00Z"},
            {"id": "amend2", "name": "2 ADITIVO EMPRESA.pdf", "createdTime": "2024-03-01T00:00:00Z"},
        ]
        self.assertEqual([item["id"] for item in module.ownership_document_candidates(files)],
                         ["base", "amend1-copy", "amend2"])

    def test_firma_mercantil_is_an_eligible_registered_act(self):
        files = [
            {"id": "old", "name": "DECLARACAO DE FIRMA MERCANTIL.pdf",
             "createdTime": "2023-08-10T19:30:20Z"},
            {"id": "new", "name": "DECLARACAO DE FIRMA MERCANTIL_000001.pdf",
             "createdTime": "2023-08-10T19:30:21Z"},
        ]
        self.assertEqual(module.ownership_document_candidates(files)[0]["id"], "new")

    def test_corrupted_native_text_layer_is_sent_to_ocr(self):
        self.assertFalse(module.native_text_needs_ocr("Contrato social válido, CNPJ 00.000.000/0001-00"))
        self.assertTrue(module.native_text_needs_ocr("texto � corrompido"))
        self.assertTrue(module.native_text_needs_ocr(""))

    def test_company_folder_resolution_handles_accents_and_requires_unique_match(self):
        drive = Mock()
        root = {'id': 'root', 'name': 'Contratos'}
        request = drive.files.return_value.list.return_value
        request.execute.return_value = {'files': [{'id': 'company', 'name': 'EMPRESA COMÉRCIO LTDA'}]}
        self.assertEqual(module.resolve_company_folder(drive, root, 'Empresa Comercio Ltda'), 'company')
        request.execute.return_value = {'files': []}
        with self.assertRaises(ValueError):
            module.resolve_company_folder(drive, root, 'Empresa Comercio Ltda')
        request.execute.return_value = {'files': [{'id': 'one', 'name': 'Empresa'}, {'id': 'two', 'name': 'Empresa'}]}
        with self.assertRaises(ValueError):
            module.resolve_company_folder(drive, root, 'Empresa')

    def test_company_folder_resolution_accepts_safe_abbreviated_trade_name(self):
        drive = Mock()
        root = {'id': 'root', 'name': 'Contratos'}
        request = drive.files.return_value.list.return_value
        request.execute.return_value = {'files': [
            {'id': '4r', 'name': '4R CONECT'},
            {'id': 'other', 'name': 'OUTRA EMPRESA'},
        ]}
        self.assertEqual(
            module.resolve_company_folder(
                drive, root, '4R CONECT - SOLUCOES EM INFRAESTRUTURA LTDA'
            ),
            '4r',
        )

    def test_company_folder_resolution_ignores_leading_registration_number(self):
        drive = Mock()
        root = {'id': 'root', 'name': 'Contratos'}
        request = drive.files.return_value.list.return_value
        request.execute.return_value = {'files': [
            {'id': 'alexandre', 'name': 'ALEXANDRE GURGEL VIANA'},
            {'id': 'romenildo', 'name': 'ROMENILDO MANOEL DA SILVA BATISTA'},
            {'id': 'natasha', 'name': 'NATASHA BASILIO TEIXEIRA CORREIA FURTADO'},
        ]}
        for number, name, folder_id in (
            ('03.516.250', 'ALEXANDRE GURGEL VIANA', 'alexandre'),
            ('36.234.106', 'ROMENILDO MANOEL DA SILVA BATISTA', 'romenildo'),
            ('42.167.772', 'NATASHA BASILIO TEIXEIRA CORR', 'natasha'),
        ):
            self.assertEqual(
                module.resolve_company_folder(drive, root, f'{number} {name}'),
                folder_id,
            )


    def test_company_folder_resolution_prefers_longest_normalized_prefix(self):
        drive = Mock()
        root = {'id': 'root', 'name': 'Contratos'}
        request = drive.files.return_value.list.return_value
        request.execute.return_value = {'files': [
            {'id': 'short', 'name': 'ANTONIO TELES'},
            {'id': 'specific', 'name': 'ANTONIO TELES FROTA JR'},
        ]}
        self.assertEqual(
            module.resolve_company_folder(
                drive, root, 'ANTONIO TELES FROTA JUNIOR & CIA LTDA'
            ),
            'specific',
        )

    def test_folder_access_distinguishes_permission_errors_from_empty_folders(self):
        drive = Mock()
        request = drive.files.return_value.get.return_value
        error = RuntimeError("upstream error")
        error.resp = Mock(status=404)
        request.execute.side_effect = error
        with self.assertRaisesRegex(ValueError, "account@example.com.*Leitor"):
            module.validate_drive_folder(drive, "root", "account@example.com")
        request.execute.side_effect = None
        request.execute.return_value = {"id": "root", "name": "Contracts", "mimeType": "application/vnd.google-apps.folder"}
        self.assertEqual(module.validate_drive_folder(drive, "root", "account@example.com")['name'], 'Contracts')
        request.execute.return_value = {"mimeType": "application/pdf"}
        with self.assertRaises(ValueError):
            module.validate_drive_folder(drive, "root", "account@example.com")

    def test_latest_aditivo_uses_created_time_not_name_or_modification(self):
        files = [
            {"id": "old", "name": "99 ADITIVO.pdf", "createdTime": "2024-01-01T00:00:00Z", "modifiedTime": "2026-01-01T00:00:00Z"},
            {"id": "new", "name": "02 aditivo assinado.pdf", "createdTime": "2024-02-01T00:00:00Z"},
            {"id": "other", "name": "Contrato.pdf", "createdTime": "2025-01-01T00:00:00Z"},
        ]
        self.assertEqual(module.latest_aditivo(iter(files))["id"], "new")
        with self.assertRaises(ValueError):
            module.latest_aditivo([files[2]])
        with self.assertRaises(ValueError):
            module.latest_aditivo([{"id": "missing", "name": "ADITIVO.pdf"}])

    def test_source_document_prefers_aditivo_and_falls_back_to_contract_social(self):
        files = [
            {"id": "contract", "name": "Contrato Social.pdf", "createdTime": "2026-01-01T00:00:00Z"},
            {"id": "aditivo", "name": "Aditivo.pdf", "createdTime": "2025-01-01T00:00:00Z"},
        ]
        self.assertEqual(module.select_source_document(files)["id"], "aditivo")
        self.assertEqual(module.select_source_document([files[0]])["id"], "contract")
        with self.assertRaisesRegex(ValueError, "CONTRATO SOCIAL"):
            module.select_source_document([{"id": "other", "name": "Alteracao.pdf", "createdTime": "2026-01-01T00:00:00Z"}])

    def test_latest_aditivo_tie_and_timezone(self):
        files = [
            {"id": "a", "name": "ADITIVO.pdf", "createdTime": "2024-02-01T00:00:00Z"},
            {"id": "b", "name": "ADITIVO.pdf", "createdTime": "2024-01-31T21:00:00-03:00"},
        ]
        self.assertEqual(module.latest_aditivo(files)["id"], "b")
        self.assertEqual(module.latest_aditivo(reversed(files))["id"], "b")

    def test_image_and_accented_document_classification(self):
        image = {"id": "image", "name": "QUADRO DE SÓCIOS.png", "createdTime": "2026-03-01T00:00:00Z"}
        amendment = {"id": "amendment", "name": "ALTERAÇÃO CONTRATUAL.jpeg", "createdTime": "2025-01-01T00:00:00Z"}
        self.assertEqual(module.select_source_document([image])["id"], "image")
        self.assertEqual(module.select_source_document([image, amendment])["id"], "amendment")

    def test_nested_paginated_folders_and_duplicate_ids(self):
        def pdf(identifier):
            return {"id": identifier, "mimeType": "application/pdf"}

        def folder(identifier):
            return {"id": identifier, "mimeType": "application/vnd.google-apps.folder"}

        pages = {
            ("root", None): {"files": [pdf("original"), folder("child")], "nextPageToken": "next"},
            ("root", "next"): {"files": [folder("empty"), pdf("original")]},
            ("empty", None): {},
            ("child", None): {"files": [folder("deep"), folder("root")], "nextPageToken": "child-next"},
            ("child", "child-next"): {"files": [pdf("amendment")]},
            ("deep", None): {"files": [pdf("latest"), pdf("amendment"), {"id": "scan", "mimeType": "image/png"}]},
        }
        drive = Mock()

        def listing(**kwargs):
            self.assertIn("trashed = false", kwargs["q"])
            self.assertTrue(kwargs["supportsAllDrives"])
            self.assertTrue(kwargs["includeItemsFromAllDrives"])
            key = (kwargs["q"].split("'")[1], kwargs["pageToken"])
            response = Mock()
            response.execute.return_value = pages[key]
            return response

        drive.files.return_value.list.side_effect = listing
        result = list(module.iter_pdf_files(drive, "root"))
        self.assertEqual({item['id'] for item in result}, {"original", "amendment", "latest", "scan"})
        self.assertEqual(len(result), 4)
        self.assertEqual(drive.files.return_value.list.call_count, len(pages))

    def test_incomplete_listing_and_access_errors_abort(self):
        drive = Mock()
        request = drive.files.return_value.list.return_value
        request.execute.return_value = {"incompleteSearch": True, "files": []}
        with self.assertRaises(ValueError):
            list(module.iter_pdf_files(drive, "root"))
        request.execute.side_effect = RuntimeError("Access denied")
        with self.assertRaises(RuntimeError):
            list(module.iter_pdf_files(drive, "root"))


if __name__ == '__main__':
    unittest.main()
