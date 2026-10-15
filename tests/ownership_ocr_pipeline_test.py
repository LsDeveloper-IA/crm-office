import importlib.util
import sys
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "ocr_pipeline", Path(__file__).parents[1] / "scripts/ownership/ocr_pipeline.py"
)
pipeline = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = pipeline
spec.loader.exec_module(pipeline)


class FakeEngine:
    def __init__(self, results):
        self.results = iter(results)

    def recognize(self, image):
        result = next(self.results)
        if isinstance(result, Exception):
            raise result
        return result


class FakeBatchEngine(FakeEngine):
    def recognize_many(self, images):
        self.batch_size = len(images)
        return [next(self.results) for _ in images]


class OCRPipelineTest(unittest.TestCase):
    def test_normalization_and_weighted_classification_are_not_exact_matches(self):
        text = "QUADRO---de   Sócios; participação no capital e C.P.F."
        result = pipeline.classificar_documento(text)
        self.assertTrue(result["approved"])
        self.assertEqual(result["category"], "quadro_societario")
        self.assertGreaterEqual(result["score"], 7)

    def test_firma_mercantil_is_a_corporate_document(self):
        result = pipeline.classificar_documento("DECLARAÇÃO DE FIRMA MERCANTIL")
        self.assertTrue(result["approved"])
        self.assertEqual(result["category"], "contrato_social")

    def test_addendum_to_corporate_statute_reaches_guided_parser_recovery(self):
        result = pipeline.classificar_documento("3º ADITIVO AO ESTATUTO SOCIAL")
        self.assertTrue(result["approved"])
        self.assertEqual(result["category"], "alteracao_societaria")
        self.assertEqual(result["score"], 8)

    def test_native_text_short_circuits_ocr(self):
        native = "CONTRATO SOCIAL CAPITAL SOCIAL SÓCIOS QUOTAS " * 4
        result = pipeline.executar_cascata_ocr(object(), native_text=native)
        self.assertEqual(result.engine, "native")

    def test_paddle_failure_uses_preprocessing_then_cloud(self):
        paddle = FakeEngine([
            ("ilegível", 10), RuntimeError("ruído"), ("texto", 20), ("texto", 20), ("texto", 20)
        ])
        cloud = FakeEngine([("ALTERAÇÃO CONTRATUAL CESSÃO DE QUOTAS CAPITAL SOCIAL SÓCIOS", 94)])
        result = pipeline.executar_cascata_ocr(
            object(), paddle=paddle, document_ai=cloud,
            image_preparer=lambda image, rotation=0: (image, rotation),
        )
        self.assertEqual(result.engine, "document-ai")
        self.assertEqual(len([a for a in result.attempts if a["engine"] == "paddleocr"]), 5)

    def test_high_confidence_original_text_skips_expensive_rotations(self):
        text = "Nome e demais dados reconhecidos corretamente no documento digitalizado. " * 3
        paddle = FakeEngine([(text, 95.63)])
        image = type("Image", (), {"shape": (100, 100, 3)})()
        result = pipeline.executar_cascata_ocr(
            image, paddle=paddle, document_ai=FakeEngine([]),
        )
        self.assertEqual(result.engine, "paddleocr")
        self.assertEqual(result.strategy, "original")
        self.assertEqual(len(result.attempts), 1)
        self.assertEqual(result.attempts[0]["acceptedBy"], "high-confidence-text")

    def test_all_failures_end_in_quarantine(self):
        failures = [("ruído", 5)] * 5
        with self.assertRaisesRegex(ValueError, "quarentena"):
            pipeline.executar_cascata_ocr(
                object(), paddle=FakeEngine(failures), document_ai=FakeEngine([("", 0)]),
                image_preparer=lambda image, rotation=0: image,
            )

    def test_document_ocr_batches_scanned_pages(self):
        text = "CONTRATO SOCIAL CAPITAL SOCIAL SOCIOS QUOTAS " * 4
        engine = FakeBatchEngine([(text, 95), (text, 96)])
        images = {1: object(), 2: object()}
        with patch.object(pipeline, "rasterizar_documento", return_value=images), \
                patch.object(pipeline, "_shared_local_ocr_engine", return_value=engine):
            result = pipeline.ocr_document(b"pdf", [1, 2], "application/pdf")
        self.assertEqual(engine.batch_size, 2)
        self.assertEqual(result["1"]["strategy"], "batch-original")
        self.assertEqual(result["2"]["strategy"], "batch-original")


if __name__ == "__main__":
    unittest.main()
