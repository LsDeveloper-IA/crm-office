import importlib.util
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path


spec = importlib.util.spec_from_file_location(
    "corporate_sections_pipeline",
    Path(__file__).parents[1] / "scripts/ownership/corporate_sections_pipeline.py",
)
pipeline = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = pipeline
spec.loader.exec_module(pipeline)


def document(identifier, name, modified):
    return pipeline.DriveDocument(
        id=identifier, name=name, mime_type="application/pdf",
        modified_time=datetime.fromisoformat(modified).replace(tzinfo=timezone.utc),
        created_time=None, size=None,
    )


class CorporateSectionsPipelineTest(unittest.TestCase):
    def test_latest_prefers_business_date_in_name_then_version(self):
        selected = pipeline.select_latest_document([
            document("a", "Contrato 2025-03-10 v1.pdf", "2026-01-01T10:00:00"),
            document("b", "Aditivo 2025-04-01 v1.pdf", "2025-04-01T10:00:00"),
            document("c", "Aditivo 2025-04-01 v2.pdf", "2025-04-01T09:00:00"),
        ])
        self.assertEqual(selected.id, "c")

    def test_latest_falls_back_to_modified_time(self):
        selected = pipeline.select_latest_document([
            document("a", "Contrato Social.pdf", "2025-01-01T10:00:00"),
            document("b", "Alteracao.pdf", "2025-02-01T10:00:00"),
        ])
        self.assertEqual(selected.id, "b")

    def test_latest_ignores_newer_non_corporate_pdf(self):
        selected = pipeline.select_latest_document([
            document("a", "Contrato Social 2025-01-10.pdf", "2025-01-10T10:00:00"),
            document("b", "Nota Fiscal 2026-01-01.pdf", "2026-01-01T10:00:00"),
        ])
        self.assertEqual(selected.id, "a")

    def test_parser_extracts_critical_blocks_and_structured_values(self):
        pages = [pipeline.PageText(1, "native", """
            EMPRESA TESTE LTDA
            CAPITAL SOCIAL
            O capital social e de R$ 20.000,00.
            QUADRO SOCIETARIO
            SOCIOS QUOTAS %
            ANA SILVA 10.000 50,00%
            BRUNO SOUZA 10.000 50,00%
            ADMINISTRACAO
            A administracao cabera a ANA SILVA.
        """, 100)]
        sections = pipeline.extract_sections(pages)
        self.assertTrue(sections["capital_social"])
        self.assertTrue(sections["quadro_societario"])
        self.assertTrue(sections["socios_quotas_percentuais"])
        self.assertTrue(sections["administracao"])
        amounts = pipeline._capital_amounts(sections["capital_social"])
        rows = pipeline._partner_rows(sections["socios_quotas_percentuais"])
        self.assertEqual(amounts[0]["amount"], "20000.00")
        self.assertEqual(sum(pipeline.Decimal(row["percentage"]) for row in rows), 100)

    def test_validation_rejects_document_without_target_sections(self):
        payload = {"companyId": "company", "data": {}, "routing": {"ocrPages": 0}}
        result = pipeline.validate_payload(payload)
        self.assertFalse(result["valid"])
        self.assertIn("nenhuma secao societaria localizada", result["errors"])

    def test_repeated_headers_are_removed(self):
        pages = [
            pipeline.PageText(1, "native", "ESCRITORIO X\nCAPITAL SOCIAL\nR$ 1.000,00"),
            pipeline.PageText(2, "native", "ESCRITORIO X\nADMINISTRACAO\nAdministrador unico"),
        ]
        sections = pipeline.extract_sections(pages)
        all_text = str(sections)
        self.assertNotIn("ESCRITORIO X", all_text)


if __name__ == "__main__":
    unittest.main()
