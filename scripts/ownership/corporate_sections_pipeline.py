"""In-memory Drive -> PDF/OCR -> corporate sections pipeline.

The source document, rendered pages and extracted text never touch the local
filesystem.  The command prints the validated JSON to stdout; operational logs
are written to stderr.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
import unicodedata
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Iterable, Protocol


PDF_MIME = "application/pdf"
MAX_SOURCE_BYTES = 25 * 1024 * 1024


@dataclass(frozen=True)
class DriveDocument:
    id: str
    name: str
    mime_type: str
    modified_time: datetime
    created_time: datetime | None
    size: int | None


@dataclass(frozen=True)
class PageText:
    page: int
    method: str
    text: str
    confidence: float | None = None


class Repository(Protocol):
    def save(self, payload: dict[str, Any]) -> str: ...


def _drive_datetime(value: str | None, *, field: str, filename: str) -> datetime:
    if not value:
        raise ValueError(f"{filename}: {field} ausente no Google Drive")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{filename}: {field} invalido") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{filename}: {field} sem timezone")
    return parsed


def _optional_drive_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def list_company_documents(drive: Any, folder_id: str) -> list[DriveDocument]:
    """Recursively list PDFs under a company folder with Drive pagination."""
    if not re.fullmatch(r"[\w-]+", folder_id):
        raise ValueError("ID da pasta do Google Drive invalido")
    pending = [folder_id]
    visited: set[str] = set()
    seen: set[str] = set()
    documents: list[DriveDocument] = []

    while pending:
        current = pending.pop()
        if current in visited:
            continue
        visited.add(current)
        token = None
        while True:
            response = drive.files().list(
                q=f"'{current}' in parents and trashed = false and "
                  "(mimeType = 'application/pdf' or "
                  "mimeType = 'application/vnd.google-apps.folder')",
                fields=("nextPageToken,incompleteSearch,"
                        "files(id,name,mimeType,size,createdTime,modifiedTime)"),
                pageSize=1000,
                pageToken=token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute(num_retries=3)
            if response.get("incompleteSearch"):
                raise RuntimeError(f"Busca incompleta na pasta {current}")
            for item in response.get("files", []):
                if item["mimeType"] == "application/vnd.google-apps.folder":
                    pending.append(item["id"])
                    continue
                if item["id"] in seen:
                    continue
                seen.add(item["id"])
                documents.append(DriveDocument(
                    id=item["id"],
                    name=item.get("name") or item["id"],
                    mime_type=item["mimeType"],
                    modified_time=_drive_datetime(
                        item.get("modifiedTime"), field="modifiedTime",
                        filename=item.get("name") or item["id"],
                    ),
                    created_time=_optional_drive_datetime(item.get("createdTime")),
                    size=int(item["size"]) if item.get("size") else None,
                ))
            token = response.get("nextPageToken")
            if not token:
                break
    return documents


_FILENAME_DATES = (
    re.compile(r"(?<!\d)(?P<year>20\d{2})[-_.](?P<month>\d{2})[-_.](?P<day>\d{2})(?!\d)"),
    re.compile(r"(?<!\d)(?P<day>\d{2})[-_.](?P<month>\d{2})[-_.](?P<year>20\d{2})(?!\d)"),
    re.compile(r"(?<!\d)(?P<year>20\d{2})(?P<month>\d{2})(?P<day>\d{2})(?!\d)"),
)
_VERSION = re.compile(r"\b(?:v|vers[aã]o|rev(?:is[aã]o)?)\s*[-_.]?\s*(\d+)\b", re.I)
_CORPORATE_NAME = re.compile(
    r"\b(?:contrato social|alteracao(?: contratual)?|aditivo|consolidacao|qsa|"
    r"quadro (?:societario|de socios)|socios?|quotas?|capital social|"
    r"cessao de quotas?|transferencia de quotas?|constituicao|"
    r"declaracao de firma mercantil|requerimento de empresario)\b"
)


def filename_date(name: str) -> datetime | None:
    dates: list[datetime] = []
    for pattern in _FILENAME_DATES:
        for match in pattern.finditer(name):
            try:
                dates.append(datetime(
                    int(match["year"]), int(match["month"]), int(match["day"]),
                    tzinfo=timezone.utc,
                ))
            except ValueError:
                continue
    return max(dates) if dates else None


def filename_version(name: str) -> int:
    return max((int(match.group(1)) for match in _VERSION.finditer(name)), default=0)


def is_corporate_filename(name: str) -> bool:
    return bool(_CORPORATE_NAME.search(normalize(name)))


def select_latest_document(documents: Iterable[DriveDocument]) -> DriveDocument:
    """Select by filename date, falling back to modifiedTime, with stable ties."""
    candidates = [document for document in documents if is_corporate_filename(document.name)]
    if not candidates:
        raise LookupError("Nenhum PDF societario identificado pelo nome na pasta da empresa")

    def ordering(document: DriveDocument) -> tuple[Any, ...]:
        named_date = filename_date(document.name)
        return (
            named_date or document.modified_time,
            named_date is not None,
            filename_version(document.name),
            document.modified_time,
            document.id,
        )

    return max(candidates, key=ordering)


def load_pdf_bytes(
    drive: Any,
    document: DriveDocument,
    *,
    max_bytes: int = MAX_SOURCE_BYTES,
) -> io.BytesIO:
    """Download a Drive file directly into a bounded in-memory buffer."""
    from googleapiclient.http import MediaIoBaseDownload

    if document.size is not None and document.size > max_bytes:
        raise ValueError(f"{document.name}: arquivo excede {max_bytes} bytes")
    stream = io.BytesIO()
    request = drive.files().get_media(fileId=document.id, supportsAllDrives=True)
    downloader = MediaIoBaseDownload(stream, request, chunksize=1024 * 1024)
    done = False
    while not done:
        _, done = downloader.next_chunk(num_retries=3)
        if stream.tell() > max_bytes:
            raise ValueError(f"{document.name}: arquivo excede {max_bytes} bytes")
    if stream.tell() == 0:
        raise ValueError(f"{document.name}: arquivo vazio")
    stream.seek(0)
    return stream


def native_text_usable(text: str, *, minimum: int = 80) -> bool:
    compact = re.sub(r"\s+", "", text or "")
    if len(compact) < minimum or "\ufffd" in compact:
        return False
    readable = sum(char.isalnum() or char in ".,;:/%$()-ºª" for char in compact)
    return readable / len(compact) >= 0.70


def extract_pdf_pages(
    source: io.BytesIO,
    *,
    ocr: Callable[[bytes, list[int], str], dict[str, dict[str, Any]]] | None = None,
    max_pages: int = 100,
) -> list[PageText]:
    """Use native text per page and OCR only pages whose text layer is unusable."""
    import pymupdf

    raw = source.getvalue()
    if not raw.startswith(b"%PDF-"):
        raise ValueError("Conteudo nao corresponde a um PDF")
    document = pymupdf.open(stream=raw, filetype="pdf")
    try:
        if document.page_count == 0:
            raise ValueError("PDF sem paginas")
        if document.page_count > max_pages:
            raise ValueError(
                f"PDF possui {document.page_count} paginas; limite: {max_pages}"
            )
        native = [page.get_text("text", sort=True).strip() for page in document]
    finally:
        document.close()

    force_ocr = False
    try:
        import os
        force_ocr = os.getenv("OWNERSHIP_FORCE_OCR", "").casefold() == "true"
    except Exception:
        pass
    missing = [
        index + 1 for index, text in enumerate(native)
        if force_ocr or not native_text_usable(text)
    ]
    ocr_result: dict[str, dict[str, Any]] = {}
    if missing:
        if ocr is None:
            try:
                from scripts.ownership.ocr_pipeline import ocr_document
            except ModuleNotFoundError:
                from ocr_pipeline import ocr_document
            ocr = ocr_document
        ocr_result = ocr(raw, missing, PDF_MIME)

    pages: list[PageText] = []
    for page_number, native_text in enumerate(native, 1):
        if page_number not in missing:
            pages.append(PageText(page_number, "native", native_text, 100.0))
            continue
        result = ocr_result.get(str(page_number), {})
        text = str(result.get("text") or "").strip()
        confidence = float(result.get("confidence") or 0)
        if not text:
            raise ValueError(f"OCR nao retornou texto para a pagina {page_number}")
        pages.append(PageText(page_number, "ocr", text, confidence))
    return pages


SECTION_PATTERNS: dict[str, tuple[str, ...]] = {
    "consolidacao": (r"\bconsolidacao\b", r"\bcontrato social consolidado\b"),
    "capital_social": (r"\bcapital social\b", r"\bdo capital\b"),
    "quadro_societario": (r"\bquadro (?:de )?socios\b", r"\bquadro societario\b",
                           r"\bcomposicao societaria\b"),
    "socios_quotas_percentuais": (r"\bsocios?\b.*\bquotas?\b",
                                    r"\bquotas?\b.*(?:%|percentual|participacao)\b",
                                    r"\bdistribuicao de quotas?\b"),
    "administracao": (r"\badministracao\b", r"\badministradores?\b"),
}
CLAUSE = re.compile(
    r"^(?:clausula\s+)?(?:primeira|segunda|terceira|quarta|quinta|sexta|setima|"
    r"oitava|nona|decima|\d+[ao]?)\b", re.I,
)
MONEY = re.compile(r"R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})", re.I)
PARTNER_ROW = re.compile(
    r"^(?P<name>[A-ZÀ-Ü][A-ZÀ-Ü\s.'’-]{3,}?)\s+"
    r"(?P<quotas>\d[\d.]*)\s+(?P<percentage>\d{1,3}(?:[,.]\d+)?)\s*%",
    re.I,
)


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(char for char in value if not unicodedata.combining(char))
    return re.sub(r"\s+", " ", value).strip().casefold()


def _clean_page_lines(pages: list[PageText]) -> dict[int, list[str]]:
    by_page = {
        page.page: [line.strip() for line in page.text.splitlines() if line.strip()]
        for page in pages
    }
    counts = Counter(
        normalized
        for lines in by_page.values()
        for line in lines
        if len(line) <= 140
        for normalized in [normalize(line)]
    )
    threshold = max(2, (len(pages) + 1) // 2)
    repeated = {line for line, count in counts.items() if count >= threshold}
    return {
        page: [line for line in lines if normalize(line) not in repeated]
        for page, lines in by_page.items()
    }


def _section_for(line: str) -> str | None:
    value = normalize(line)
    if len(value) > 180:
        return None
    for section, patterns in SECTION_PATTERNS.items():
        if any(re.search(pattern, value) for pattern in patterns):
            return section
    return None


def extract_sections(pages: list[PageText], *, max_lines: int = 80) -> dict[str, list[dict[str, Any]]]:
    """Capture heading/clause blocks instead of returning indiscriminate full text."""
    output = {section: [] for section in SECTION_PATTERNS}
    for page_number, lines in _clean_page_lines(pages).items():
        starts = [(index, section) for index, line in enumerate(lines)
                  if (section := _section_for(line))]
        for position, (start, section) in enumerate(starts):
            end = starts[position + 1][0] if position + 1 < len(starts) else len(lines)
            end = min(end, start + max_lines)
            for index in range(start + 1, end):
                if CLAUSE.match(normalize(lines[index])):
                    end = index
                    break
            text = "\n".join(lines[start:end]).strip()
            if text:
                output[section].append({"page": page_number, "text": text})
    return output


def _decimal(value: str) -> Decimal:
    return Decimal(value.replace(".", "").replace(",", "."))


def _capital_amounts(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    amounts, seen = [], set()
    for block in blocks:
        for match in MONEY.finditer(block["text"]):
            try:
                amount = _decimal(match.group(1)).quantize(Decimal("0.01"))
            except InvalidOperation:
                continue
            key = (block["page"], amount)
            if key not in seen:
                seen.add(key)
                amounts.append({"page": block["page"], "currency": "BRL",
                                "amount": str(amount)})
    return amounts


def _partner_rows(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for block in blocks:
        for line in block["text"].splitlines():
            match = PARTNER_ROW.match(line.strip())
            if match:
                rows.append({
                    "name": re.sub(r"\s+", " ", match["name"]).strip(),
                    "quotas": int(match["quotas"].replace(".", "")),
                    "percentage": str(Decimal(
                        match["percentage"].replace(",", ".")
                    ).quantize(Decimal("0.01"))),
                    "page": block["page"],
                })
    return rows


def build_payload(company_id: str, document: DriveDocument, pages: list[PageText], digest: str) -> dict[str, Any]:
    sections = extract_sections(pages)
    partner_blocks = sections["socios_quotas_percentuais"] or sections["quadro_societario"]
    named_date = filename_date(document.name)
    return {
        "schemaVersion": "1.0",
        "processingId": str(uuid.uuid4()),
        "processedAt": datetime.now(timezone.utc).isoformat(),
        "companyId": company_id,
        "sourceDocument": {
            "driveFileId": document.id,
            "name": document.name,
            "mimeType": document.mime_type,
            "modifiedTime": document.modified_time.isoformat(),
            "createdTime": document.created_time.isoformat() if document.created_time else None,
            "sha256": digest,
            "selection": {
                "filenameDate": named_date.date().isoformat() if named_date else None,
                "filenameVersion": filename_version(document.name),
                "policy": "filename-date-or-modified-time/version/modified-time/id",
            },
        },
        "routing": {
            "pageCount": len(pages),
            "nativePages": sum(page.method == "native" for page in pages),
            "ocrPages": sum(page.method == "ocr" for page in pages),
            "pages": [{"page": page.page, "method": page.method,
                       "confidence": page.confidence, "characters": len(page.text)}
                      for page in pages],
        },
        "data": {
            "consolidacao": sections["consolidacao"],
            "capitalSocial": {
                "blocks": sections["capital_social"],
                "declaredAmounts": _capital_amounts(sections["capital_social"]),
            },
            "quadroSocietario": sections["quadro_societario"],
            "sociosQuotasPercentuais": {
                "blocks": sections["socios_quotas_percentuais"],
                "rows": _partner_rows(partner_blocks),
            },
            "administracao": sections["administracao"],
        },
    }


def validate_payload(payload: dict[str, Any]) -> dict[str, Any]:
    errors, warnings = [], []
    if not payload.get("companyId"):
        errors.append("companyId ausente")
    data = payload.get("data") or {}
    collections = [data.get("consolidacao"), data.get("quadroSocietario"),
                   data.get("administracao"), (data.get("capitalSocial") or {}).get("blocks"),
                   (data.get("sociosQuotasPercentuais") or {}).get("blocks")]
    if not any(collections):
        errors.append("nenhuma secao societaria localizada")
    rows = (data.get("sociosQuotasPercentuais") or {}).get("rows") or []
    if rows:
        total = sum((Decimal(row["percentage"]) for row in rows), Decimal(0))
        if abs(total - Decimal(100)) > Decimal("0.05"):
            warnings.append(f"percentuais somam {total}%")
    if (payload.get("routing") or {}).get("ocrPages"):
        warnings.append("ha paginas processadas por OCR; considerar revisao humana")
    return {"valid": not errors, "errors": errors, "warnings": warnings}


class MockRepository:
    def save(self, payload: dict[str, Any]) -> str:
        record_id = str(uuid.uuid4())
        print(json.dumps({"event": "corporate-sections.mock-saved",
                          "recordId": record_id,
                          "processingId": payload["processingId"]}), file=sys.stderr)
        return record_id


def run_pipeline(
    company_id: str,
    folder_id: str,
    *,
    drive: Any,
    repository: Repository | None = None,
    ocr: Callable[[bytes, list[int], str], dict[str, dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    documents = list_company_documents(drive, folder_id)
    selected = select_latest_document(documents)
    source = load_pdf_bytes(drive, selected)
    try:
        raw = source.getvalue()
        pages = extract_pdf_pages(source, ocr=ocr)
        payload = build_payload(company_id, selected, pages, hashlib.sha256(raw).hexdigest())
    finally:
        source.close()
    validation = validate_payload(payload)
    payload["validation"] = validation
    if not validation["valid"]:
        raise ValueError("Documento rejeitado: " + "; ".join(validation["errors"]))
    record_id = (repository or MockRepository()).save(payload)
    return {"recordId": record_id, "payload": payload}


def _connect_drive(folder_id: str) -> Any:
    try:
        from scripts.ownership.extract import connect_drive
    except ModuleNotFoundError:
        from extract import connect_drive
    drive, _ = connect_drive(folder_id)
    return drive


def main() -> int:
    parser = argparse.ArgumentParser(description="Extrai secoes societarias do PDF mais recente")
    parser.add_argument("--company-id", required=True)
    parser.add_argument("--folder-id", required=True)
    args = parser.parse_args()
    result = run_pipeline(args.company_id, args.folder_id,
                          drive=_connect_drive(args.folder_id))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
