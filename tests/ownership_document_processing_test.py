import importlib.util
import io
import sys
from pathlib import Path
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "document_processing",
    Path(__file__).parents[1] / "scripts/ownership/document_processing.py",
)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


VALID = {
    "empresa": "EMPRESA TESTE LTDA",
    "cnpj": "12345678000195",
    "documento": {"tipo": "alteracao_contratual", "data": "2024-02-01"},
    "socios": [{
        "nome": "PESSOA TESTE", "cpf_cnpj": "52998224725",
        "qualificacao": "socio-administrador", "percentual": 100,
    }],
    "confianca": 0.96,
}


class FakeDrive:
    def ler_bytes(self, file_id):
        self.file_id = file_id
        return io.BytesIO(b"document bytes")


class FakeReader:
    def strategies(self, source, mime_type):
        self.raw = source.getvalue()
        yield module.ReadCandidate("multimodal-vision", images=[(self.raw, mime_type)])


class FakeProvider:
    def __init__(self, outcomes):
        self.outcomes = iter(outcomes)

    def extract(self, **kwargs):
        outcome = next(self.outcomes)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class DocumentProcessingTest(unittest.TestCase):
    def test_pipeline_returns_standardized_payload(self):
        drive, reader = FakeDrive(), FakeReader()
        result = module.processar_arquivo_drive(
            "file-id", "image/jpeg", drive_service=drive, reader=reader,
            parser=module.DocumentParser(FakeProvider([VALID])),
        )
        self.assertEqual(result, VALID)
        self.assertEqual(drive.file_id, "file-id")
        self.assertEqual(reader.raw, b"document bytes")

    def test_validator_rejects_invented_or_malformed_identifiers(self):
        invalid = {**VALID, "socios": [{**VALID["socios"][0], "cpf_cnpj": "123"}]}
        with self.assertRaisesRegex(ValueError, "CPF/CNPJ"):
            module.DocumentValidator.validate(invalid)

    def test_image_routes_to_local_ocr(self):
        fake_ocr = type("OCR", (), {"ocr_document": staticmethod(
            lambda raw, pages, mime: {"1": {"text": "CAPITAL SOCIAL " * 10}}
        )})
        with patch.dict(sys.modules, {
            "ocr_pipeline": fake_ocr,
            "scripts.ownership.ocr_pipeline": fake_ocr,
        }):
            first = next(module.DocumentReader().strategies(
                io.BytesIO(b"jpeg"), "image/jpeg"
            ))
        self.assertEqual(first.strategy, "local-ocr")

    def test_receita_qsa_text_keeps_unpublished_percentage_null(self):
        payload = module._payload_from_text(
            "Consulta Quadro de Sócios e Administradores - QSA\n"
            "CNPJ:\n39.644.188/0001-46\nNOME EMPRESARIAL:\n"
            "4R CONECT - SOLUCOES EM INFRAESTRUTURA LTDA\n"
            "Nome/Nome Empresarial:\nSAMUEL MARCONDES RIOS SOEIRO\n"
            "Qualificação:\n49-Sócio-Administrador\nEmitido no dia 27/02/2024"
        )
        self.assertEqual(payload["cnpj"], "39644188000146")
        self.assertEqual(payload["socios"][0]["nome"], "SAMUEL MARCONDES RIOS SOEIRO")
        self.assertIsNone(payload["socios"][0]["percentual"])


if __name__ == "__main__":
    unittest.main()
