"""The converter backends, weakest dependency first.

Each backend raises :class:`ExternalConverterRequired` when the file is not its job, which is what
lets :func:`f2md.chain.convert` fall through without treating "wrong backend" as an error.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Protocol, runtime_checkable

from .detect import detect_document_kind, is_text_kind
from .types import ConversionError, ConvertedDocument, ExternalConverterRequired

DEFAULT_MAX_CHARS = int(os.environ.get("F2MD_MAX_CHARS", "400000"))
DEFAULT_TIMEOUT_S = int(os.environ.get("F2MD_TIMEOUT_S", "120"))


@runtime_checkable
class Converter(Protocol):
    name: str

    def convert(self, path: str) -> ConvertedDocument: ...


def _stat_metadata(path: str) -> Dict[str, Any]:
    info = os.stat(path)
    return {
        "source": path,
        "size": info.st_size,
        "mtime": datetime.fromtimestamp(info.st_mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def _clip(text: str, max_chars: int) -> str:
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n\n…[truncated]"


class TextConverter:
    """Text and source files, using only the standard library.

    Markdown passes through untouched; everything else is fenced with its language so the original
    bytes stay recoverable and a downstream indexer does not mistake code for prose.
    """

    name = "deterministic-text"
    version = "1.2.0"

    def __init__(self, max_chars: int = DEFAULT_MAX_CHARS) -> None:
        self.max_chars = max_chars

    def convert(self, path: str) -> ConvertedDocument:
        kind = detect_document_kind(path)
        if not is_text_kind(kind):
            raise ExternalConverterRequired(kind)
        with open(path, "rb") as handle:
            raw = handle.read()
        if b"\x00" in raw:
            # A NUL byte means this is not really text, whatever the extension claims.
            raise ExternalConverterRequired(kind)
        text = raw.decode("utf-8", errors="replace")
        name = os.path.basename(path)
        if kind in (".md", ".markdown"):
            markdown = text
        else:
            fence = kind.lstrip(".") or "text"
            markdown = f"# {name}\n\n```{fence}\n{_clip(text, self.max_chars)}\n```\n"
        metadata = _stat_metadata(path)
        metadata["extractedChars"] = len(text)
        return ConvertedDocument(markdown, metadata, [], self.name, self.version)


class LocalToolConverter:
    """`pdftotext` (poppler) and `pandoc`, so PDFs and Office files work with no daemon.

    Both are looked up before use, so a missing binary falls through the chain instead of raising
    an opaque FileNotFoundError.
    """

    name = "local-tools"
    version = "1.0.0"

    PANDOC_FORMATS = {".docx": "docx", ".odt": "odt", ".rtf": "rtf", ".pptx": "pptx", ".epub": "epub"}

    def __init__(self, max_chars: int = DEFAULT_MAX_CHARS, timeout_s: int = DEFAULT_TIMEOUT_S) -> None:
        self.max_chars = max_chars
        self.timeout_s = timeout_s

    def _run(self, argv: list, tool: str) -> str:
        try:
            done = subprocess.run(argv, capture_output=True, timeout=self.timeout_s, check=False)
        except subprocess.TimeoutExpired as error:
            raise ConversionError(f"{tool.upper()}_TIMEOUT:{self.timeout_s}s") from error
        if done.returncode != 0:
            detail = done.stderr.decode("utf-8", errors="replace").strip()[:300]
            raise ConversionError(f"{tool.upper()}_FAILED:{done.returncode}:{detail}")
        text = done.stdout.decode("utf-8", errors="replace").strip()
        if not text:
            raise ConversionError(f"{tool.upper()}_EMPTY")
        return text

    def convert(self, path: str) -> ConvertedDocument:
        kind = detect_document_kind(path)
        if kind == ".pdf":
            if not shutil.which("pdftotext"):
                raise ExternalConverterRequired(kind)
            text = self._run(["pdftotext", "-layout", "-enc", "UTF-8", path, "-"], "pdftotext")
            tool = "pdftotext"
        elif kind in self.PANDOC_FORMATS:
            if not shutil.which("pandoc"):
                raise ExternalConverterRequired(kind)
            text = self._run(
                ["pandoc", path, "-f", self.PANDOC_FORMATS[kind], "-t", "markdown", "--wrap=none"],
                "pandoc",
            )
            tool = "pandoc"
        else:
            raise ExternalConverterRequired(kind)
        metadata = _stat_metadata(path)
        metadata["extractedChars"] = len(text)
        name = os.path.basename(path)
        return ConvertedDocument(f"# {name}\n\n{_clip(text, self.max_chars)}\n", metadata, [], tool, self.version)


class DoclingHttpConverter:
    """A Docling service over HTTP, for everything the local tools cannot read.

    Uses urllib so the package stays dependency-free; the multipart body is assembled by hand.
    """

    name = "docling-http"
    version = "1.0.0"

    def __init__(self, base_url: Optional[str] = None, timeout_s: int = 180) -> None:
        self.base_url = (base_url or os.environ.get("DOCLING_URL") or "http://127.0.0.1:5001").rstrip("/")
        self.timeout_s = timeout_s

    def convert(self, path: str) -> ConvertedDocument:
        with open(path, "rb") as handle:
            payload = handle.read()
        boundary = "----f2md" + os.urandom(12).hex()
        name = os.path.basename(path)
        head = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{name}"\r\n'
            "Content-Type: application/octet-stream\r\n\r\n"
        ).encode("utf-8")
        body = head + payload + f"\r\n--{boundary}--\r\n".encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/convert",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_s) as response:
                data = json.loads(response.read().decode("utf-8"))
        except Exception as error:  # noqa: BLE001 - surfaced as one conversion failure
            raise ConversionError(f"DOCLING_HTTP:{error}") from error
        markdown = data.get("markdown")
        if not isinstance(markdown, str):
            raise ConversionError("DOCLING_MARKDOWN_MISSING")
        metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else _stat_metadata(path)
        assets = [str(a) for a in data.get("assets", [])] if isinstance(data.get("assets"), list) else []
        return ConvertedDocument(markdown, metadata, assets, str(data.get("converter") or "docling"), self.version)


class DoclingLocalConverter:
    """Docling in-process, when the optional `docling` extra is installed."""

    name = "docling-local"
    version = "1.0.0"

    def __init__(self) -> None:
        try:
            from docling.document_converter import DocumentConverter  # type: ignore[import-not-found]
        except ImportError as error:  # pragma: no cover - depends on optional extra
            raise ConversionError("DOCLING_NOT_INSTALLED: pip install 'f2md[docling]'") from error
        self._converter = DocumentConverter()

    def convert(self, path: str) -> ConvertedDocument:
        try:
            result = self._converter.convert(path)
            markdown = result.document.export_to_markdown()
        except Exception as error:  # noqa: BLE001 - surfaced as one conversion failure
            raise ConversionError(f"DOCLING_LOCAL_FAILED:{error}") from error
        metadata = _stat_metadata(path)
        metadata["extractedChars"] = len(markdown)
        return ConvertedDocument(markdown, metadata, [], "docling", self.version)
