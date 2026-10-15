import importlib.util
import io
import os
import sys
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location(
    "extract_gemini", Path(__file__).parents[1] / "scripts/ownership/extract.py"
)
extract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract)


class GeminiApiError(Exception):
    def __init__(self, code, details=None):
        super().__init__(f"HTTP {code}")
        self.code = code
        self.details = details or {}


class GeminiRequestTest(unittest.TestCase):
    def create_modules(self, chat):
        google = ModuleType("google")
        genai = ModuleType("google.genai")
        types = ModuleType("google.genai.types")
        errors = ModuleType("google.genai.errors")
        httpx = ModuleType("httpx")
        client = Mock()
        client.chats.create.return_value = chat
        genai.Client = Mock(return_value=client)
        types.GenerateContentConfig = Mock()
        types.HttpOptions = Mock(return_value="http-options")
        types.Part = SimpleNamespace(
            from_text=Mock(return_value="prompt"),
            from_bytes=Mock(return_value="document"),
        )
        types.FinishReason = SimpleNamespace(MAX_TOKENS="MAX_TOKENS")
        errors.APIError = GeminiApiError
        httpx.TransportError = type("TransportError", (Exception,), {})
        httpx.TimeoutException = type("TimeoutException", (httpx.TransportError,), {})
        google.genai = genai
        genai.types = types
        genai.errors = errors
        return {
            "google": google,
            "google.genai": genai,
            "google.genai.types": types,
            "google.genai.errors": errors,
            "httpx": httpx,
        }, client, genai

    def call_with_mocked_client(self, chat, recovery_feedback=None):
        modules, client, genai = self.create_modules(chat)
        with patch.dict(sys.modules, modules), patch.dict(
            os.environ,
            {"GEMINI_API_KEY": "test-key", "GEMINI_MAX_ATTEMPTS": "8"},
            clear=True,
        ), patch.object(extract.time, "sleep") as sleep:
            result = extract.gemini_document_text(
                b"content", "document.pdf", "application/pdf",
                recovery_feedback=recovery_feedback,
            )
        return result, sleep, client, genai

    def test_retries_with_extended_backoff_and_cools_down_after_success(self):
        chat = Mock()
        chat.send_message.side_effect = [
            *[GeminiApiError(503) for _ in range(7)],
            SimpleNamespace(text="transcribed", candidates=[]),
        ]

        result, sleep, client, genai = self.call_with_mocked_client(chat)

        self.assertEqual(result, "transcribed")
        self.assertEqual(chat.send_message.call_count, 8)
        self.assertEqual(
            [call.args[0] for call in sleep.call_args_list],
            [1, 2, 4, 8, 16, 32, 60, 2],
        )
        self.assertEqual(genai.Client.call_args.kwargs, {
            "api_key": "test-key", "http_options": "http-options",
        })
        self.assertEqual(genai.types.HttpOptions.call_args.kwargs, {"timeout": 180000})
        self.assertEqual(client.chats.create.call_args.kwargs["model"], "gemini-3.5-flash-lite")
        client.close.assert_called_once()

    def test_request_timeout_fails_explicitly_without_retrying(self):
        chat = Mock()
        modules, client, _ = self.create_modules(chat)
        chat.send_message.side_effect = modules["httpx"].TimeoutException("timed out")

        with patch.dict(sys.modules, modules), patch.dict(
            os.environ, {"GEMINI_API_KEY": "test-key"}, clear=True
        ), patch.object(extract.time, "sleep") as sleep:
            with self.assertRaisesRegex(modules["httpx"].TimeoutException, "timed out"):
                extract.gemini_document_text(b"content", "document.pdf", "application/pdf")

        chat.send_message.assert_called_once()
        sleep.assert_not_called()
        client.close.assert_called_once()

    def test_retry_after_is_capped_at_sixty_seconds(self):
        chat = Mock()
        chat.send_message.side_effect = [
            GeminiApiError(503, {"error": {"details": [{
                "@type": "type.googleapis.com/google.rpc.RetryInfo",
                "retryDelay": "90s",
            }]}}),
            SimpleNamespace(text="transcribed", candidates=[]),
        ]

        _, sleep, _, _ = self.call_with_mocked_client(chat)

        self.assertEqual([call.args[0] for call in sleep.call_args_list], [60, 2])

    def test_not_found_is_reported_without_retrying(self):
        chat = Mock()
        chat.send_message.side_effect = GeminiApiError(404)
        modules, client, _ = self.create_modules(chat)

        with patch.dict(sys.modules, modules), patch.dict(
            os.environ, {"GEMINI_API_KEY": "test-key"}, clear=True
        ), patch.object(extract.time, "sleep") as sleep:
            with self.assertRaisesRegex(GeminiApiError, "HTTP 404"):
                extract.gemini_document_text(b"content", "document.pdf", "application/pdf")

        chat.send_message.assert_called_once()
        sleep.assert_not_called()
        client.close.assert_called_once()

    def test_empty_response_retries_and_recovery_prompt_includes_parser_feedback(self):
        chat = Mock()
        chat.send_message.side_effect = [
            SimpleNamespace(text="", candidates=[]),
            SimpleNamespace(text="transcribed", candidates=[]),
        ]

        result, sleep, _, genai = self.call_with_mocked_client(
            chat, recovery_feedback="total do quadro sem valor monetário reconhecível"
        )

        prompt = genai.types.Part.from_text.call_args.kwargs["text"]
        self.assertEqual(result, "transcribed")
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [1, 2])
        self.assertIn("RECUPERACAO GUIADA", prompt)
        self.assertIn("total do quadro sem valor monetário reconhecível", prompt)
        self.assertIn("QSA que apenas enumera socios nao comprova", prompt)
        self.assertIn("nao crie percentual", prompt)

    def test_repeated_empty_response_stops_before_repeating_a_large_document_eight_times(self):
        chat = Mock()
        chat.send_message.side_effect = [
            SimpleNamespace(text="", candidates=[]),
            SimpleNamespace(text="", candidates=[]),
        ]
        modules, client, _ = self.create_modules(chat)

        with patch.dict(sys.modules, modules), patch.dict(
            os.environ,
            {"GEMINI_API_KEY": "test-key", "GEMINI_MAX_ATTEMPTS": "8"},
            clear=True,
        ), patch.object(extract.time, "sleep") as sleep:
            with self.assertRaisesRegex(
                extract.GeminiEmptyResponseError, "texto vazio após 2 tentativas"
            ):
                extract.gemini_document_text(b"content", "document.pdf", "application/pdf")

        self.assertEqual(chat.send_message.call_count, 2)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [1])
        client.close.assert_called_once()

    def test_empty_whole_pdf_response_falls_back_to_two_page_chunks(self):
        from pypdf import PdfReader, PdfWriter

        writer = PdfWriter()
        for _ in range(3):
            writer.add_blank_page(width=100, height=100)
        with io.BytesIO() as stream:
            writer.write(stream)
            raw = stream.getvalue()

        with patch.object(extract, "gemini_document_text", side_effect=[
            extract.GeminiEmptyResponseError("empty whole document"),
            "first chunk", "last page",
        ]) as read_text, patch.object(extract, "audit_log"):
            result, strategy = extract.gemini_document_text_with_page_fallback(
                raw, "aditivo.pdf", "application/pdf", source_file_id="drive-file",
            )

        self.assertEqual(strategy, "two-page-fallback")
        self.assertIn("[[PAGINAS 1-2]]\nfirst chunk", result)
        self.assertIn("[[PAGINAS 3-3]]\nlast page", result)
        self.assertEqual(read_text.call_count, 3)
        first_chunk = PdfReader(io.BytesIO(read_text.call_args_list[1].args[0]))
        last_chunk = PdfReader(io.BytesIO(read_text.call_args_list[2].args[0]))
        self.assertEqual(len(first_chunk.pages), 2)
        self.assertEqual(len(last_chunk.pages), 1)

    def test_recovery_prompt_explains_safe_percentage_reconciliation(self):
        chat = Mock()
        chat.send_message.return_value = SimpleNamespace(text="transcribed", candidates=[])

        _, _, _, genai = self.call_with_mocked_client(
            chat, recovery_feedback="quadro não fecha em 100%"
        )

        prompt = genai.types.Part.from_text.call_args.kwargs["text"]
        self.assertIn("CORRECAO DO FECHAMENTO PERCENTUAL", prompt)
        self.assertIn("somarem exatamente o capital", prompt)
        self.assertIn("nao altere montantes", prompt)


if __name__ == "__main__":
    unittest.main()
