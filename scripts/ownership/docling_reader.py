"""Whole-document, in-memory PDF extraction with local Docling models."""
from __future__ import annotations

import io
import threading
from typing import Any


_CONVERTER: Any | None = None
_CONVERTER_LOCK = threading.Lock()


def _converter() -> Any:
    global _CONVERTER
    if _CONVERTER is not None:
        return _CONVERTER
    with _CONVERTER_LOCK:
        if _CONVERTER is not None:
            return _CONVERTER
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import (
            PdfPipelineOptions,
            RapidOcrOptions,
            TableFormerMode,
        )
        from docling.document_converter import DocumentConverter, PdfFormatOption

        options = PdfPipelineOptions(
            do_ocr=True,
            do_table_structure=True,
            enable_remote_services=False,
            generate_page_images=False,
            generate_picture_images=False,
            ocr_batch_size=4,
            layout_batch_size=4,
            table_batch_size=4,
        )
        options.ocr_options = RapidOcrOptions(
            lang=["pt"], backend="onnxruntime", print_verbose=False,
        )
        options.table_structure_options.mode = TableFormerMode.FAST
        options.table_structure_options.do_cell_matching = False
        _CONVERTER = DocumentConverter(format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=options),
        })
        return _CONVERTER


def extract_document(raw: bytes, *, name: str = "document.pdf") -> str:
    """Convert one complete PDF from memory to structured Markdown text."""
    if not raw.startswith(b"%PDF-"):
        raise ValueError("conteudo nao corresponde a PDF")
    from docling.datamodel.base_models import DocumentStream

    source = DocumentStream(name=name, stream=io.BytesIO(raw))
    result = _converter().convert(source, raises_on_error=True)
    text = result.document.export_to_markdown().strip()
    if not text:
        raise ValueError("Docling nao retornou texto")
    return text
