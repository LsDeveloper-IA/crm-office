"""Resilient OCR/digitization layer, independent from ownership field extraction."""
from __future__ import annotations

import os
import re
import json
import sys
import itertools
import unicodedata
import warnings
import subprocess
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class OCRResult:
    text: str
    confidence: float
    engine: str
    strategy: str
    attempts: list[dict[str, Any]] = field(default_factory=list)


class OCREngine(Protocol):
    def recognize(self, image: Any) -> tuple[str, float]: ...


class UnavailableEngine:
    def __init__(self, reason: Exception) -> None:
        self.reason = reason

    def recognize(self, image: Any) -> tuple[str, float]:
        raise RuntimeError(str(self.reason)) from self.reason


_LOCAL_OCR_ENGINE: OCREngine | None = None


def _shared_local_ocr_engine() -> OCREngine:
    global _LOCAL_OCR_ENGINE
    if _LOCAL_OCR_ENGINE is None:
        try:
            _LOCAL_OCR_ENGINE = PaddleOCREngine()
        except Exception as error:
            _LOCAL_OCR_ENGINE = UnavailableEngine(error)
    return _LOCAL_OCR_ENGINE


class PaddleOCREngine:
    """Free local PP-OCR engine; accepts an in-memory OpenCV/numpy image."""

    def __init__(self) -> None:
        os.environ.setdefault("GLOG_minloglevel", "2")
        original_check_output = subprocess.check_output

        def quiet_optional_ccache_lookup(command, *args, **kwargs):
            if (isinstance(command, (list, tuple)) and len(command) >= 2
                    and str(command[0]).casefold() == "where"
                    and str(command[1]).casefold() == "ccache"):
                kwargs.setdefault("stderr", subprocess.DEVNULL)
            return original_check_output(command, *args, **kwargs)

        subprocess.check_output = quiet_optional_ccache_lookup
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", message="No ccache found.*")
                from paddleocr import PaddleOCR

                self.pipeline = PaddleOCR(
                    lang=os.getenv("OWNERSHIP_OCR_LANGUAGE", "pt"),
                    use_doc_orientation_classify=False,
                    use_doc_unwarping=False,
                    use_textline_orientation=False,
                )
        finally:
            subprocess.check_output = original_check_output

    def recognize(self, image: Any) -> tuple[str, float]:
        return self.recognize_many([image])[0]

    def recognize_many(self, images: list[Any]) -> list[tuple[str, float]]:
        """Run all page images in one Paddle pipeline call."""
        results = list(self.pipeline.predict(images))
        output: list[tuple[str, float]] = []
        for result in results:
            texts = [str(value).strip() for value in result.get("rec_texts", [])
                     if str(value).strip()]
            scores = [float(value) for value in result.get("rec_scores", [])]
            confidence = sum(scores) / len(scores) * 100 if scores else 0.0
            output.append(("\n".join(texts), confidence))
        if len(output) != len(images):
            raise ValueError(
                f"PaddleOCR retornou {len(output)} resultados para {len(images)} paginas"
            )
        return output


def preparar_imagem(image: Any, *, rotation: int = 0, scale: float = 1.5) -> Any:
    """Grayscale, upscale, denoise and binarize an image for difficult OCR."""
    import cv2
    import numpy as np

    if isinstance(image, (bytes, bytearray)):
        image = cv2.imdecode(np.frombuffer(image, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("imagem inválida ou não decodificável")
    if rotation:
        rotations = {
            90: cv2.ROTATE_90_CLOCKWISE,
            180: cv2.ROTATE_180,
            270: cv2.ROTATE_90_COUNTERCLOCKWISE,
        }
        image = cv2.rotate(image, rotations[rotation])
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    enlarged = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    blurred = cv2.GaussianBlur(enlarged, (3, 3), 0)
    binary = cv2.adaptiveThreshold(
        blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 11
    )
    # Keep HxWxC so cloud/image encoders receive a conventional color array.
    return limitar_imagem(cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR))


def limitar_imagem(image: Any, max_side: int = 1400) -> Any:
    """Bound image upload/processing cost while preserving aspect ratio."""
    import cv2
    height, width = image.shape[:2]
    largest = max(height, width)
    if largest <= max_side:
        return image
    ratio = max_side / largest
    return cv2.resize(
        image, (max(1, int(width * ratio)), max(1, int(height * ratio))),
        interpolation=cv2.INTER_AREA,
    )


def _progress(event: str, **fields: Any) -> None:
    print(json.dumps({"event": event, **fields}, ensure_ascii=False, default=str),
          file=sys.stderr, flush=True)


def normalizar_texto(texto: str) -> str:
    value = unicodedata.normalize("NFKD", texto or "")
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = value.upper().replace("\u00a0", " ")
    value = re.sub(r"[^A-Z0-9%$]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


DOCUMENT_RULES = {
    "alteracao_societaria": {
        r"\bADITIV[OA]\b": 5,
        r"\bALTERAC[A-Z]*\s+CONTRATUAL\b": 6,
        r"\bCESS[A-Z]*\s+(?:E\s+TRANSFERENCIA\s+)?DE\s+(?:QUOTAS|COTAS)\b": 6,
        r"\bRETIR[A-Z]*\s+DA\s+SOCIEDADE\b": 4,
        r"\bESTATUTO(?:\s+SOCIAL)?\b": 3,
        r"\bCAPITAL\s+SOCIAL\b": 3,
        r"\bSOCIOS?\b": 2,
        r"\bQUOTAS?\b|\bCOTAS?\b": 2,
    },
    "quadro_societario": {
        r"\bQ\s*S\s*A\b": 6,
        r"\bQUADRO\s+(?:DE\s+)?SOC(?:IO|IOS|IETARIO|IETARIA)\b": 6,
        r"\bSOCIO\s+ADMINISTRADOR\b": 5,
        r"\bPARTICIPAC[A-Z]*\b": 3,
        r"\bCAPITAL\s+SOCIAL\b": 3,
        r"\bCPF\b|\bCNPJ\b": 2,
        r"\bQUOTAS?\b|\bCOTAS?\b": 2,
    },
    "contrato_social": {
        r"\bCONTRATO\s+SOCIAL\b": 7,
        r"\bCONSTITUIC[A-Z]*\b": 5,
        r"\bDECLARAC[A-Z]*\s+DE\s+FIRMA\s+MERCANTIL\b": 7,
        r"\bREQUERIMENTO\s+DE\s+EMPRESARIO\b": 7,
        r"\bSOCIEDADE\s+(?:EMPRESARIA|LIMITADA)\b": 3,
        r"\bCAPITAL\s+SOCIAL\b": 3,
        r"\bSOCIOS?\b": 2,
    },
}


def classificar_documento(texto: str, *, minimum_score: int = 7) -> dict[str, Any]:
    normalized = normalizar_texto(texto)
    scores: dict[str, int] = {}
    evidence: dict[str, list[str]] = {}
    for category, rules in DOCUMENT_RULES.items():
        hits = [pattern for pattern in rules if re.search(pattern, normalized, re.I)]
        scores[category] = sum(rules[pattern] for pattern in hits)
        evidence[category] = hits
    ranking = sorted(scores, key=scores.get, reverse=True)
    best = ranking[0]
    return {
        "category": best,
        "score": scores[best],
        "approved": scores[best] >= minimum_score,
        "scores": scores,
        "evidence": evidence[best],
    }


def _text_quality(text: str) -> float:
    compact = re.sub(r"\s+", "", text or "")
    if not compact:
        return 0.0
    readable = sum(char.isalnum() or char in ".,;:/%$()-" for char in compact)
    length_factor = min(1.0, len(compact) / 80)
    return 100 * readable / len(compact) * length_factor


def executar_cascata_ocr(
    image: Any,
    *,
    native_text: str = "",
    paddle: OCREngine | None = None,
    document_ai: OCREngine | None = None,
    local_engine: OCREngine | None = None,
    minimum_confidence: float = 55,
    fast_accept_confidence: float = 90,
    fast_accept_min_chars: int = 80,
    image_preparer=preparar_imagem,
) -> OCRResult:
    attempts: list[dict[str, Any]] = []
    native_quality = _text_quality(native_text)
    if native_quality >= 75:
        return OCRResult(native_text.strip(), native_quality, "native", "pdf-text", attempts)

    try:
        primary = paddle or local_engine or _shared_local_ocr_engine()
        primary_name = "paddleocr"
        # Injected engines in tests may use opaque image objects. Production local
        # OCR receives a bounded OpenCV image.
        variants = itertools.chain(
            [("original", image if paddle is not None else limitar_imagem(image))],
            ((f"preprocessed-rot{rotation}", image_preparer(image, rotation=rotation))
             for rotation in (0, 90, 270, 180))
        )
        for strategy, variant in variants:
            try:
                _progress("ocr.attempt.started", engine=primary_name, strategy=strategy,
                          shape=list(variant.shape))
                text, confidence = primary.recognize(variant)
                classification = classificar_documento(text)
                attempts.append({"engine": primary_name, "strategy": strategy,
                                 "confidence": confidence, "score": classification["score"]})
                _progress("ocr.attempt.completed", engine=primary_name, strategy=strategy,
                          confidence=round(confidence, 2), score=classification["score"])
                if (strategy == "original" and confidence >= fast_accept_confidence
                        and len(normalizar_texto(text)) >= fast_accept_min_chars):
                    attempts[-1]["acceptedBy"] = "high-confidence-text"
                    _progress("ocr.fast_path.accepted", engine=primary_name,
                              strategy=strategy, confidence=round(confidence, 2), chars=len(text))
                    return OCRResult(text.strip(), confidence, primary_name, strategy, attempts)
                if text.strip() and confidence >= minimum_confidence and classification["approved"]:
                    return OCRResult(text.strip(), confidence, primary_name, strategy, attempts)
            except Exception as error:
                attempts.append({"engine": primary_name, "strategy": strategy, "error": str(error)})
    except Exception as error:
        attempts.append({"engine": "paddleocr", "strategy": "initialize", "error": str(error)})

    # Kept only for backwards-compatible tests or an explicitly injected provider.
    # Production does not configure a cloud OCR fallback.
    if document_ai is not None:
        try:
            text, confidence = document_ai.recognize(image)
            classification = classificar_documento(text)
            attempts.append({"engine": "document-ai", "strategy": "explicit-fallback",
                             "confidence": confidence, "score": classification["score"]})
            if text.strip() and confidence >= minimum_confidence and classification["approved"]:
                return OCRResult(text.strip(), confidence, "document-ai", "explicit-fallback", attempts)
        except Exception as error:
            attempts.append({"engine": "document-ai", "strategy": "explicit-fallback",
                             "error": str(error)})

    raise ValueError(f"OCR esgotou todos os fallbacks; quarentena: {attempts}")


def rasterizar_documento(raw: bytes, mime_type: str, pages: list[int]) -> dict[int, Any]:
    import cv2
    import numpy as np
    if mime_type != "application/pdf":
        image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("imagem inválida")
        return {1: image}
    import pymupdf
    document = pymupdf.open(stream=raw, filetype="pdf")
    try:
        output = {}
        for page_number in pages:
            page = document.load_page(page_number - 1)
            # 2.5x (~180 DPI) keeps CPU inference bounded; difficult pages are then
            # enlarged 1.5x by OpenCV to an effective ~270 DPI.
            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2.5, 2.5), alpha=False)
            encoded = np.frombuffer(pixmap.tobytes("png"), dtype=np.uint8)
            output[page_number] = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        return output
    finally:
        document.close()


def ocr_document(raw: bytes, page_numbers: list[int], mime_type: str) -> dict[str, dict[str, Any]]:
    images = rasterizar_documento(raw, mime_type, page_numbers)
    local_engine = _shared_local_ocr_engine()
    output = {}
    ordered = list(images.items())
    batch_results: list[tuple[str, float]] | None = None
    recognize_many = getattr(local_engine, "recognize_many", None)
    if callable(recognize_many) and ordered:
        _progress("ocr.batch.started", engine="paddleocr",
                  pages=[page for page, _ in ordered])
        batch_results = recognize_many([image for _, image in ordered])
        _progress("ocr.batch.completed", engine="paddleocr", pages=len(ordered))

    minimum = float(os.getenv("OWNERSHIP_OCR_MIN_CONFIDENCE", "55"))
    for index, (page_number, image) in enumerate(ordered):
        batch_text, batch_confidence = batch_results[index] if batch_results else ("", 0.0)
        classification = classificar_documento(batch_text)
        fast_accept = batch_confidence >= 90 and len(normalizar_texto(batch_text)) >= 80
        classified_accept = (
            batch_text.strip() and batch_confidence >= minimum and classification["approved"]
        )
        if fast_accept or classified_accept:
            result = OCRResult(
                batch_text.strip(), batch_confidence, "paddleocr", "batch-original",
                [{"engine": "paddleocr", "strategy": "batch-original",
                  "confidence": batch_confidence, "score": classification["score"]}],
            )
        else:
            result = executar_cascata_ocr(image, local_engine=local_engine)
        output[str(page_number)] = {
            "text": result.text, "confidence": result.confidence,
            "engine": result.engine, "strategy": result.strategy,
            "attempts": result.attempts,
        }
    return output
