"""In-memory corporate-document reading and structured extraction.

Boundaries:
DriveService -> DocumentReader (strategies) -> DocumentParser (multimodal AI)
-> DocumentValidator -> caller/database.

No source document is persisted. Bytes, rendered pages and OCR text live only for the
duration of ``processar_arquivo_drive``.
"""
from __future__ import annotations

import io
import json
import os
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Iterator, Protocol


SUPPORTED_MIMES = {"application/pdf", "image/jpeg", "image/png"}
MAX_SOURCE_BYTES = 25 * 1024 * 1024
MAX_VISION_PAGES = 12


OUTPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["empresa", "cnpj", "documento", "socios", "confianca"],
    "properties": {
        "empresa": {"type": ["string", "null"]},
        "cnpj": {"type": ["string", "null"]},
        "documento": {
            "type": "object", "additionalProperties": False,
            "required": ["tipo", "data"],
            "properties": {
                "tipo": {"type": "string"},
                "data": {"type": ["string", "null"]},
            },
        },
        "socios": {
            "type": "array",
            "items": {
                "type": "object", "additionalProperties": False,
                "required": ["nome", "cpf_cnpj", "qualificacao", "percentual"],
                "properties": {
                    "nome": {"type": "string"},
                    "cpf_cnpj": {"type": ["string", "null"]},
                    "qualificacao": {"type": ["string", "null"]},
                    "percentual": {"type": ["number", "null"], "minimum": 0, "maximum": 100},
                },
            },
        },
        "confianca": {"type": "number", "minimum": 0, "maximum": 1},
    },
}


EXTRACTION_INSTRUCTIONS = """Extraia somente fatos visíveis no documento societário.
Não invente CPF/CNPJ, datas ou percentuais. Use null quando o documento não informar.
Normalize CPF/CNPJ para apenas dígitos, datas para YYYY-MM-DD e percentual para 0..100.
Em documento QSA da Receita, não presuma que um único sócio possui 100%: use null se a
participação não estiver impressa. A confiança deve refletir legibilidade e completude."""


class MultimodalProvider(Protocol):
    def extract(self, *, text: str | None = None,
                images: list[tuple[bytes, str]] | None = None,
                content: bytes | None = None,
                mime_type: str | None = None) -> dict[str, Any]: ...


class DriveService:
    """Read-only Drive adapter; source bytes never touch the filesystem."""

    def __init__(self, drive_client: Any, *, max_bytes: int = MAX_SOURCE_BYTES) -> None:
        self.drive = drive_client
        self.max_bytes = max_bytes

    def ler_bytes(self, file_id: str) -> io.BytesIO:
        from googleapiclient.http import MediaIoBaseDownload

        stream = io.BytesIO()
        request = self.drive.files().get_media(fileId=file_id, supportsAllDrives=True)
        reader = MediaIoBaseDownload(stream, request, chunksize=1024 * 1024)
        done = False
        while not done:
            _, done = reader.next_chunk(num_retries=3)
            if stream.tell() > self.max_bytes:
                raise ValueError(f"documento excede {self.max_bytes} bytes")
        if stream.tell() == 0:
            raise ValueError("documento vazio")
        stream.seek(0)
        return stream


@dataclass(frozen=True)
class ReadCandidate:
    strategy: str
    text: str | None = None
    images: list[tuple[bytes, str]] | None = None
    content: bytes | None = None
    mime_type: str | None = None


class DocumentReader:
    """Strategy router producing candidates from cheapest to most expensive."""

    def __init__(self, *, min_native_chars: int = 120,
                 max_vision_pages: int = MAX_VISION_PAGES) -> None:
        self.min_native_chars = min_native_chars
        self.max_vision_pages = max_vision_pages

    @staticmethod
    def _legivel(text: str, minimum: int) -> bool:
        compact = re.sub(r"\s+", "", text or "")
        if len(compact) < minimum:
            return False
        readable = sum(char.isalnum() or char in ".,;:/%$()-" for char in compact)
        return readable / len(compact) >= 0.75 and "\ufffd" not in compact

    def _pdf(self, raw: bytes) -> tuple[str, list[tuple[bytes, str]]]:
        import pymupdf

        document = pymupdf.open(stream=raw, filetype="pdf")
        try:
            if document.page_count > self.max_vision_pages:
                raise ValueError(
                    f"PDF com {document.page_count} páginas excede limite multimodal "
                    f"de {self.max_vision_pages}"
                )
            text = "\n\f\n".join(page.get_text("text") for page in document)
            images: list[tuple[bytes, str]] = []
            if not self._legivel(text, self.min_native_chars):
                for page in document:
                    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False)
                    images.append((pixmap.tobytes("jpeg", jpg_quality=85), "image/jpeg"))
            return text, images
        finally:
            document.close()

    def strategies(self, source: io.BytesIO, mime_type: str) -> Iterator[ReadCandidate]:
        if mime_type not in SUPPORTED_MIMES:
            raise ValueError(f"MIME type não suportado: {mime_type}")
        raw = source.getvalue()
        if mime_type == "application/pdf":
            native_text, images = self._pdf(raw)
            if self._legivel(native_text, self.min_native_chars):
                yield ReadCandidate("native-pdf", text=native_text)
                return
        else:
            images = [(raw, mime_type)]

        # Scans/images use the local PaddleOCR/OpenCV cascade.
        try:
            from scripts.ownership.ocr_pipeline import ocr_document
        except ModuleNotFoundError:
            from ocr_pipeline import ocr_document
        pages = list(range(1, len(images) + 1)) if mime_type == "application/pdf" else [1]
        ocr_pages = ocr_document(raw, pages, mime_type)
        ocr_text = "\n\f\n".join(
            ocr_pages[str(page)]["text"] for page in pages if str(page) in ocr_pages
        )
        if ocr_text.strip():
            yield ReadCandidate("local-ocr", text=ocr_text)


def _digits(value: str | None) -> str | None:
    result = re.sub(r"\D", "", value or "")
    return result or None


def _parse_date(value: str | None) -> str | None:
    if not value:
        return None
    for pattern in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value.strip(), pattern).date().isoformat()
        except ValueError:
            pass
    return None


def _payload_from_text(text: str) -> dict[str, Any]:
    """Conservative normalization for plain OCR processors; never infers absent data."""
    company = None
    company_match = re.search(
        r"NOME\s+EMPRESARIAL\s*:?\s*[\r\n]+\s*([^\r\n]+)", text, re.I
    )
    if company_match:
        company = company_match.group(1).strip()
    cnpj_match = re.search(r"\b\d{2}[.\s]?\d{3}[.\s]?\d{3}\s*/\s*\d{4}\s*-\s*\d{2}\b", text)
    cnpj = _digits(cnpj_match.group(0)) if cnpj_match else None

    normalized = text.upper()
    if "QUADRO DE SÓCIOS" in normalized or "QUADRO DE SOCIOS" in normalized or re.search(r"\bQSA\b", normalized):
        document_type = "qsa"
    elif "ADITIVO" in normalized or "ALTERAÇÃO CONTRATUAL" in normalized or "ALTERACAO CONTRATUAL" in normalized:
        document_type = "alteracao_contratual"
    elif "CONTRATO SOCIAL" in normalized:
        document_type = "contrato_social"
    else:
        document_type = "documento_societario"
    dates = re.findall(r"\b\d{2}/\d{2}/\d{4}\b", text)
    document_date = next((_parse_date(value) for value in reversed(dates) if _parse_date(value)), None)

    socios: list[dict[str, Any]] = []
    # Receita QSA layout: repeated name/qualification blocks, without participation.
    qsa_pattern = re.compile(
        r"Nome/Nome\s+Empresarial\s*:?\s*[\r\n]+\s*([^\r\n]+).*?"
        r"Qualifica(?:ção|cao|��o)\s*:?\s*[\r\n]+\s*([^\r\n]+)",
        re.I | re.S,
    )
    for name, qualification in qsa_pattern.findall(text):
        socios.append({
            "nome": name.strip(), "cpf_cnpj": None,
            "qualificacao": qualification.strip(), "percentual": None,
        })

    # For contracts/aditivos, reuse the tolerant table reader already exercised by
    # the ownership corpus. Identity is accepted only when bound to the same name.
    if not socios:
        try:
            from scripts.ownership.corpus import read_tables, qualification
            from scripts.ownership.extract import valid_cpf
        except ModuleNotFoundError:
            from corpus import read_tables, qualification
            from extract import valid_cpf
        try:
            table = read_tables(text)
            for row in table["rows"]:
                identities = qualification(text, row["name"], valid_cpf)
                identifiers = {
                    item.get("cpf") or item.get("partnerCnpj")
                    for item in identities if item.get("cpf") or item.get("partnerCnpj")
                }
                socios.append({
                    "nome": row["name"],
                    "cpf_cnpj": next(iter(identifiers)) if len(identifiers) == 1 else None,
                    "qualificacao": None,
                    "percentual": row["percentageBps"] / 100,
                })
        except ValueError:
            pass

    completeness = sum((bool(company), bool(cnpj), bool(document_date), bool(socios))) / 4
    detailed = bool(socios) and all(
        partner["cpf_cnpj"] is not None or partner["qualificacao"] is not None
        for partner in socios
    )
    confidence = min(0.95, 0.35 + completeness * 0.45 + (0.15 if detailed else 0))
    return {
        "empresa": company, "cnpj": cnpj,
        "documento": {"tipo": document_type, "data": document_date},
        "socios": socios, "confianca": round(confidence, 2),
    }


class DocumentParser:
    def __init__(self, provider: MultimodalProvider) -> None:
        self.provider = provider

    def parse(self, candidate: ReadCandidate) -> dict[str, Any]:
        return self.provider.extract(
            text=candidate.text, images=candidate.images,
            content=candidate.content, mime_type=candidate.mime_type,
        )


class DocumentValidator:
    @staticmethod
    def validate(payload: dict[str, Any]) -> dict[str, Any]:
        required = {"empresa", "cnpj", "documento", "socios", "confianca"}
        if set(payload) != required:
            raise ValueError("estrutura de saída inválida")
        cnpj = payload["cnpj"]
        if cnpj is not None and not re.fullmatch(r"\d{14}", cnpj):
            raise ValueError("CNPJ da empresa inválido")
        if not isinstance(payload["socios"], list):
            raise ValueError("socios deve ser um array")
        for socio in payload["socios"]:
            if set(socio) != {"nome", "cpf_cnpj", "qualificacao", "percentual"}:
                raise ValueError("estrutura de sócio inválida")
            identifier = socio["cpf_cnpj"]
            if identifier is not None and not re.fullmatch(r"\d{11}|\d{14}", identifier):
                raise ValueError(f"CPF/CNPJ inválido para {socio.get('nome', 'sócio')}")
            percentage = socio["percentual"]
            if percentage is not None and not 0 <= float(percentage) <= 100:
                raise ValueError("percentual fora do intervalo 0..100")
        confidence = float(payload["confianca"])
        if not 0 <= confidence <= 1:
            raise ValueError("confiança fora do intervalo 0..1")
        document_date = payload["documento"].get("data")
        if document_date is not None:
            parsed = date.fromisoformat(document_date)
            if parsed > datetime.now().date():
                raise ValueError("data do documento está no futuro")
        return payload


def processar_arquivo_drive(
    file_id: str,
    mime_type: str,
    *,
    drive_service: DriveService | None = None,
    reader: DocumentReader | None = None,
    parser: DocumentParser | None = None,
    validator: DocumentValidator | None = None,
) -> dict[str, Any]:
    """Read, route, extract and validate one Drive document entirely in memory."""
    if drive_service is None:
        from dotenv import load_dotenv
        import google.auth
        from googleapiclient.discovery import build

        load_dotenv()
        credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/drive.readonly"]
        )
        drive_service = DriveService(build(
            "drive", "v3", credentials=credentials, cache_discovery=False
        ))
    reader = reader or DocumentReader()
    parser = parser or DocumentParser(type("LocalTextProvider", (), {
        "extract": staticmethod(lambda **kwargs: _payload_from_text(kwargs.get("text") or ""))
    })())
    validator = validator or DocumentValidator()
    source = drive_service.ler_bytes(file_id)
    failures: list[dict[str, str]] = []
    try:
        for candidate in reader.strategies(source, mime_type):
            try:
                result = validator.validate(parser.parse(candidate))
                return result
            except Exception as error:
                failures.append({"estrategia": candidate.strategy, "erro": str(error)})
        raise ValueError(f"todas as estratégias falharam: {failures}")
    finally:
        source.close()
