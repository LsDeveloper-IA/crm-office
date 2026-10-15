import importlib.util
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("extract_ocr", Path(__file__).parents[1] / "scripts/ownership/extract.py")
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)


class ExtractionFlowTest(unittest.TestCase):
    def run_extract(self, pages, ocr, mime_type="application/pdf", docling=None):
        first = "CNPJ: 00.000.000/0001-00\nVigência: 01/02/2024\nOrdem: 1\nCapital social: R$ 100.000,00"
        second = "Sócio: Pessoa Teste; CPF: 529.982.247-25; Nascimento: 01/01/1980; Participação: 100,00%"
        downloader = Mock()
        downloader.next_chunk.return_value = (None, True)
        reader = SimpleNamespace(pages=[SimpleNamespace(extract_text=lambda value=value: value)
                                      for value in pages(first, second)])
        file = {"id": "fixture", "name": "CONTRATO SOCIAL", "mimeType": mime_type, "createdTime": "2024-01-01T00:00:00Z"}
        raw = b"%PDF-fixture" if mime_type == "application/pdf" else b"\x89PNG\r\n\x1a\nfixture"
        stream = None
        def download_chunk(num_retries=0):
            downloader._fd.write(raw)
            return (None, True)
        def downloader_factory(fd, request, chunksize):
            downloader._fd = fd
            downloader.next_chunk.side_effect = download_chunk
            return downloader
        with patch.dict(sys.modules, {
            "googleapiclient.http": SimpleNamespace(MediaIoBaseDownload=downloader_factory),
            "pypdf": SimpleNamespace(PdfReader=Mock(return_value=reader)),
        }), patch.object(extract, "connect_drive", return_value=(Mock(), {})), \
                patch.object(extract, "resolve_company_folder", return_value="folder"), \
                patch.object(extract, "iter_pdf_files", return_value=[file]), \
                patch.object(extract, "apply_docling", side_effect=(
                    docling if isinstance(docling, Exception)
                    else None if docling is not None
                    else ValueError("Docling indisponivel no teste")
                ), return_value=docling if isinstance(docling, str) else None), \
                patch.object(extract, "apply_ocr", return_value=ocr(first, second)) as apply_ocr:
            result = extract.extract("folder", "00000000000100")
            if mime_type != "application/pdf":
                self.assertEqual(apply_ocr.call_args.kwargs["mime_type"], mime_type)
            self.assertEqual(extract.iter_pdf_files.call_count, 1)
            return result, apply_ocr.call_count

    def test_scanned_pdf_uses_whole_document_docling_before_page_ocr(self):
        docling_text = (
            "CNPJ: 00.000.000/0001-00\nVigencia: 01/02/2024\nOrdem: 1\n"
            "Capital social: R$ 100.000,00\n"
            "Socios Quotas % Valor (R$)\n"
            "PESSOA TESTE 100.000 100% 100.000,00\n"
            "TOTAL 100.000 100% 100.000,00\n"
            "PESSOA TESTE, brasileiro, nascido em 01/01/1980, "
            "inscrito no CPF 529.982.247-25\n"
            "Data de inicio dos efeitos: 01/02/2024"
        )
        result, ocr_calls = self.run_extract(
            lambda a, b: ["", ""], lambda a, b: {}, docling=docling_text,
        )
        self.assertEqual(ocr_calls, 0)
        self.assertEqual(result["partners"][0]["ownershipHistory"][0]["percentageBps"], 10000)

    def test_rejects_mime_mismatch_and_truncated_download(self):
        with self.assertRaisesRegex(ValueError, "MIME type"):
            extract.validate_document_bytes(b"<html>login</html>", "application/pdf")
        with self.assertRaisesRegex(ValueError, "download incompleto"):
            extract.validate_document_bytes(b"%PDF-data", "application/pdf", "999")

    def test_native_text_is_parsed_without_ocr(self):
        result, calls = self.run_extract(lambda a, b: [a, b], lambda a, b: {})
        self.assertEqual(calls, 0)
        self.assertEqual(result["partners"][0]["birthDate"], "1980-01-01")

    def test_all_scanned_pages_are_replaced(self):
        result, calls = self.run_extract(lambda a, b: ["", ""],
                                        lambda a, b: {"1": {"text": a, "confidence": 95}, "2": {"text": b, "confidence": 95}})
        self.assertEqual(calls, 1)
        self.assertEqual(result["partners"][0]["ownershipHistory"][0]["percentageBps"], 10000)

    def test_missing_ocr_page_is_rejected(self):
        with self.assertRaises(ValueError):
            self.run_extract(lambda a, b: ["", ""], lambda a, b: {"2": {"text": b, "confidence": 95}})

    def test_low_confidence_page_is_quarantined(self):
        with patch.dict("os.environ", {"OWNERSHIP_OCR_MIN_CONFIDENCE": "80"}):
            with self.assertRaisesRegex(ValueError, "histórico societário importável"):
                self.run_extract(lambda a, b: ["", ""], lambda a, b: {
                    "1": {"text": a, "confidence": 79},
                    "2": {"text": b, "confidence": 95},
                })

    def test_image_uses_ocr_without_pdf_reader(self):
        result, calls = self.run_extract(lambda a, b: [],
            lambda a, b: {"1": {"text": a + "\n" + b, "confidence": 95}}, mime_type="image/png")
        self.assertEqual(calls, 1)
        self.assertEqual(result["partners"][0]["name"], "Pessoa Teste")


if __name__ == "__main__":
    unittest.main()
