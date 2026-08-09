"""The converter backends, weakest dependency first.

Each backend raises :class:`ExternalConverterRequired` when the file is not its job, which is what
lets :func:`f2md.chain.convert` fall through without treating "wrong backend" as an error.

Heavier backends (MarkItDown, PyMuPDF, Docling) import their library lazily so the core package
stays stdlib-only and a missing extra degrades to "not my job" rather than an ImportError.
"""

from __future__ import annotations

import contextlib
import struct
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Optional, Protocol, Tuple, runtime_checkable

from .detect import detect_document_kind, is_docling_kind, is_text_kind
from .types import ConversionError, ConvertedDocument, ExternalConverterRequired

DEFAULT_MAX_CHARS = int(os.environ.get("F2MD_MAX_CHARS", "400000"))
DEFAULT_TIMEOUT_S = int(os.environ.get("F2MD_TIMEOUT_S", "120"))

#: PyMuPDF logs one of these per page it had to recognise rather than read.
_OCR_PAGE_MARKER = re.compile(r"OCR on page", re.IGNORECASE)


@runtime_checkable
class Converter(Protocol):
    name: str
    backend_type: str

    def convert(self, path: str) -> ConvertedDocument: ...


def _stat_metadata(path: str) -> Dict[str, Any]:
    info = os.stat(path)
    return {
        # Absolute: a caller that recorded a relative path cannot resolve it later from a
        # different working directory, which defeats the point of recording provenance.
        "source": os.path.abspath(path),
        "size": info.st_size,
        "mtime": datetime.fromtimestamp(info.st_mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def _clip(text: str, max_chars: int) -> Tuple[str, List[str]]:
    """Truncate to ``max_chars``, reporting it as a warning rather than silently losing content."""
    if max_chars <= 0 or len(text) <= max_chars:
        return text, []
    return text[:max_chars] + "\n\n…[truncated]", [f"TRUNCATED:{max_chars}:{len(text)}"]


class _Captured:
    """Holds whatever a backend printed, once the capture block has exited."""

    text: str = ""


@contextlib.contextmanager
def _quiet_stdout() -> Iterator[_Captured]:
    """Keep a backend's chatter off stdout.

    PyMuPDF prints banners like "=== Document parser messages ===" from its C extension, straight
    to file descriptor 1 — `contextlib.redirect_stdout` only rebinds `sys.stdout` and misses it
    entirely. Left alone this corrupts `f2md file --json` into unparseable output, so the file
    descriptor itself is redirected for the duration of the call.
    """
    captured = _Captured()
    sys.stdout.flush()
    saved_fd = os.dup(1)
    with tempfile.TemporaryFile(mode="w+b") as sink:
        os.dup2(sink.fileno(), 1)
        try:
            # Also rebind sys.stdout, so pure-Python prints land in the same sink.
            with contextlib.redirect_stdout(io.TextIOWrapper(os.fdopen(os.dup(1), "wb"), errors="replace")):
                yield captured
        finally:
            sys.stdout.flush()
            os.dup2(saved_fd, 1)
            os.close(saved_fd)
            sink.seek(0)
            captured.text = sink.read().decode("utf-8", errors="replace")


def _package_version(module_name: str, fallback: str = "unknown") -> str:
    try:
        from importlib.metadata import version

        return version(module_name)
    except Exception:  # noqa: BLE001 - version reporting must never break a conversion
        return fallback


class TextConverter:
    """Text and source files, using only the standard library.

    Markdown passes through untouched; everything else is fenced with its language so the original
    bytes stay recoverable and a downstream indexer does not mistake code for prose.
    """

    name = "deterministic-text"
    backend_type = "stdlib"
    version = "1.2.0"

    def __init__(self, max_chars: int = DEFAULT_MAX_CHARS) -> None:
        self.max_chars = max_chars

    def convert(self, path: str) -> ConvertedDocument:
        kind = detect_document_kind(path)
        # LaTeX is text syntactically, but it is a document format. Give Pandoc a chance to
        # preserve headings, lists, tables and mathematics; only fence it when Pandoc is absent.
        if kind == ".tex" and shutil.which("pandoc"):
            raise ExternalConverterRequired(kind)
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
            markdown, warnings = text, []
        else:
            body, warnings = _clip(text, self.max_chars)
            fence = kind.lstrip(".") or "text"
            markdown = f"# {name}\n\n```{fence}\n{body}\n```\n"
        metadata = _stat_metadata(path)
        metadata["extractedChars"] = len(text)
        return ConvertedDocument(
            markdown, metadata, [], self.name, self.version,
            backend_type=self.backend_type, input_kind=kind, warnings=warnings,
        )


class ScadSourceConverter:
    """Preserve OpenSCAD source and expose its parametric intent deterministically."""

    name = "scad-source"
    backend_type = "stdlib"
    version = "1.1.0"

    def convert(self, path: str) -> ConvertedDocument:
        kind = detect_document_kind(path)
        if kind != ".scad":
            raise ExternalConverterRequired(kind)
        text = open(path, "r", encoding="utf-8", errors="replace").read()
        parameters = [
            f"{match.group(1)} = {match.group(2).strip()}"
            for match in re.finditer(r"(?m)^\s*([A-Za-z_]\w*)\s*=\s*([^;]+);", text)
        ]
        dependencies = re.findall(r"(?m)^\s*(?:use|include)\s*<([^>]+)>", text)
        operators = sorted(set(re.findall(
            r"\b(cylinder|sphere|cube|polyhedron|linear_extrude|rotate_extrude|translate|rotate|scale|"
            r"mirror|hull|minkowski|difference|union|intersection)\s*\(", text,
        )))
        body = (
            f"# {os.path.basename(path)}\n\n"
            "## Extracted SCAD intent\n\n"
            f"- Parameters: {len(parameters)}\n"
            f"- Dependencies: {', '.join(dependencies) or 'none'}\n"
            f"- Geometry/operators: {', '.join(operators) or 'none'}\n\n"
            + "\n".join(f"- {item}" for item in parameters)
            + f"\n\n## Source\n\n```scad\n{text.rstrip()}\n```\n"
        )
        metadata = _stat_metadata(path)
        metadata.update({"extractedChars": len(text), "parameters": len(parameters),
                         "dependencies": dependencies, "operators": operators})
        return ConvertedDocument(body, metadata, [], self.name, self.version,
                                 backend_type=self.backend_type, input_kind=kind)


class STLMetadataConverter:
    """Extract deterministic, text-friendly geometry metadata from STL meshes.

    STL contains triangles rather than semantic prose.  A local parser keeps conversion useful
    when Docling is unavailable (or rejects a mesh) without pretending that a mesh is a document.
    """

    name = "stl-metadata"
    backend_type = "stdlib"
    version = "1.0.0"

    def convert(self, path: str) -> ConvertedDocument:
        if detect_document_kind(path) != ".stl":
            raise ExternalConverterRequired(detect_document_kind(path))
        raw = open(path, "rb").read()
        vertices: List[Tuple[float, float, float]] = []
        triangles = 0
        # Binary STL: 80-byte header, uint32 facet count, 50 bytes per facet.
        if len(raw) >= 84:
            count = struct.unpack_from("<I", raw, 80)[0]
            expected = 84 + count * 50
            if count and expected <= len(raw):
                triangles = count
                for offset in range(84, expected, 50):
                    for vertex_offset in (12, 24, 36):
                        vertices.append(struct.unpack_from("<fff", raw, offset + vertex_offset))
        if not triangles:
            # Minimal ASCII STL fallback for hand-authored meshes.
            text = raw.decode("utf-8", errors="ignore")
            vals = re.findall(r"vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)", text, re.I)
            vertices = [(float(x), float(y), float(z)) for x, y, z in vals]
            triangles = len(vertices) // 3
        if not triangles or not vertices:
            raise ConversionError("STL_INVALID_OR_EMPTY")
        mins = tuple(min(v[i] for v in vertices) for i in range(3))
        maxs = tuple(max(v[i] for v in vertices) for i in range(3))
        size = tuple(maxs[i] - mins[i] for i in range(3))
        body = (
            f"# {os.path.basename(path)}\n\n"
            "## Mesh metadata\n\n"
            f"- triangles: {triangles}\n"
            f"- vertices: {len(vertices)}\n"
            f"- bounding box min (x, y, z): {mins[0]:.6f}, {mins[1]:.6f}, {mins[2]:.6f}\n"
            f"- bounding box max (x, y, z): {maxs[0]:.6f}, {maxs[1]:.6f}, {maxs[2]:.6f}\n"
            f"- dimensions (x, y, z): {size[0]:.6f}, {size[1]:.6f}, {size[2]:.6f}\n"
        )
        metadata = _stat_metadata(path)
        metadata["extractedChars"] = len(body)
        metadata["triangles"] = triangles
        metadata["dimensions"] = list(size)
        return ConvertedDocument(body, metadata, [], self.name, self.version,
                                 backend_type=self.backend_type, input_kind=".stl")


class LocalToolConverter:
    """`pdftotext` (poppler) and `pandoc`, so PDFs and Office files work with no daemon.

    Both are looked up before use, so a missing binary falls through the chain instead of raising
    an opaque FileNotFoundError.
    """

    name = "local-tools"
    backend_type = "binary"
    version = "1.0.0"

    PANDOC_FORMATS = {
        ".tex": "latex", ".docx": "docx", ".odt": "odt", ".rtf": "rtf", ".pptx": "pptx", ".epub": "epub",
    }

    def __init__(self, max_chars: int = DEFAULT_MAX_CHARS, timeout_s: int = DEFAULT_TIMEOUT_S) -> None:
        self.max_chars = max_chars
        self.timeout_s = timeout_s

    def _run(self, argv: List[str], tool: str) -> str:
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
        body, warnings = _clip(text, self.max_chars)
        if tool == "pdftotext":
            # pdftotext emits a plain text layer: tables and figures are flattened or lost.
            warnings.append("LAYOUT_ONLY:tables and images are not preserved")
        metadata = _stat_metadata(path)
        metadata["extractedChars"] = len(text)
        return ConvertedDocument(
            f"# {os.path.basename(path)}\n\n{body}\n", metadata, [], tool, self.version,
            backend_type=self.backend_type, input_kind=kind, warnings=warnings,
        )


class PyMuPDFConverter:
    """PDFs with a text layer, via `pymupdf4llm`.

    Produces structured Markdown (headings, lists, tables) rather than the flat text layer
    `pdftotext` yields, so it is the better default when document structure matters. It cannot do
    OCR, so scanned PDFs are declined and left to Docling.

    Requires the optional extra: ``pip install 'f2md[pymupdf]'``.
    """

    name = "pymupdf4llm"
    backend_type = "python"

    def __init__(self, max_chars: int = DEFAULT_MAX_CHARS, min_chars: int = 32) -> None:
        self.max_chars = max_chars
        # Below this, the PDF almost certainly has no text layer and needs OCR instead.
        self.min_chars = min_chars
        self.version = _package_version("pymupdf4llm")

    def convert(self, path: str) -> ConvertedDocument:
        kind = detect_document_kind(path)
        if kind != ".pdf":
            raise ExternalConverterRequired(kind)
        try:
            import pymupdf4llm  # type: ignore[import-not-found]
        except ImportError:
            # Missing extra is a routing signal, not a failure: the chain moves on.
            raise ExternalConverterRequired(kind) from None
        # MuPDF's message store is process-global and accumulates across documents. Without a
        # reset, messages from a previously converted PDF get attributed to this one — which in a
        # tree run silently mislabels which files went through OCR.
        try:
            import pymupdf  # type: ignore[import-not-found]

            pymupdf.TOOLS.reset_mupdf_warnings()
        except Exception:  # noqa: BLE001 - attribution is best-effort, never fatal
            pass
        try:
            with _quiet_stdout() as chatter:
                text = str(pymupdf4llm.to_markdown(path)).strip()
        except Exception as error:  # noqa: BLE001 - surfaced as one conversion failure
            raise ConversionError(f"PYMUPDF_FAILED:{error}") from error
        noise = chatter.text.strip()
        try:
            import pymupdf  # type: ignore[import-not-found]

            # The store holds this document's messages now; stdout only carries a summary banner.
            noise = "\n".join(filter(None, [noise, str(pymupdf.TOOLS.mupdf_warnings() or "")])).strip()
        except Exception:  # noqa: BLE001
            pass
        if len(text) < self.min_chars:
            # A scanned page yields almost nothing here; hand it to a backend that can OCR.
            raise ExternalConverterRequired(kind)
        body, warnings = _clip(text, self.max_chars)
        # PyMuPDF falls back to Tesseract per page and says so on stdout. Reporting ocr=false while
        # the text actually came from recognition would defeat the point of the field, so the
        # captured chatter is the evidence: only a per-page "OCR on page" line counts, not the
        # generic "Using Tesseract for OCR processing" capability banner.
        ocr = bool(_OCR_PAGE_MARKER.search(noise))
        if noise:
            warnings.append("BACKEND_DIAGNOSTIC:" + " / ".join(noise.splitlines())[:200])
        metadata = _stat_metadata(path)
        metadata["extractedChars"] = len(text)
        return ConvertedDocument(
            body, metadata, [], self.name, self.version,
            backend_type=self.backend_type, input_kind=kind, ocr=ocr, warnings=warnings,
        )


class MarkItDownConverter:
    """Microsoft MarkItDown: Office, HTML, XLSX, PPTX, CSV, images and more.

    A broad general-purpose backend, placed after the specialised ones so a PDF still goes through
    the PDF-aware path first.

    Requires the optional extra: ``pip install 'f2md[markitdown]'``.
    """

    name = "markitdown"
    backend_type = "python"
    #: Formats worth routing here. Plain text and source files are handled earlier and cheaper.
    SUPPORTED = (
        ".pdf", ".docx", ".doc", ".pptx", ".ppt", ".xlsx", ".xls", ".odt", ".ods", ".rtf", ".epub",
        ".html", ".htm", ".csv", ".tsv", ".json", ".xml", ".zip",
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".tiff", ".bmp",
    )
    #: Formats that must be claimed *before* the text backend, or they would be fenced as code
    #: instead of becoming real Markdown. Mirrors TurndownConverter's position in the JS chain.
    MARKUP = (".html", ".htm")

    def __init__(self, max_chars: int = DEFAULT_MAX_CHARS, kinds: Optional[Tuple[str, ...]] = None) -> None:
        self.max_chars = max_chars
        #: Restrict this instance to a subset, so the same backend can sit at two chain positions.
        self.kinds = kinds or self.SUPPORTED
        self.version = _package_version("markitdown")
        self._converter: Any = None

    def convert(self, path: str) -> ConvertedDocument:
        kind = detect_document_kind(path)
        if kind not in self.kinds:
            raise ExternalConverterRequired(kind)
        if self._converter is None:
            try:
                from markitdown import MarkItDown  # type: ignore[import-not-found]
            except ImportError:
                raise ExternalConverterRequired(kind) from None
            self._converter = MarkItDown()
        try:
            with _quiet_stdout():
                result = self._converter.convert(path)
            text = str(getattr(result, "text_content", "") or "").strip()
        except Exception as error:  # noqa: BLE001 - surfaced as one conversion failure
            raise ConversionError(f"MARKITDOWN_FAILED:{error}") from error
        if not text:
            raise ConversionError("MARKITDOWN_EMPTY")
        body, warnings = _clip(text, self.max_chars)
        metadata = _stat_metadata(path)
        metadata["extractedChars"] = len(text)
        title = getattr(result, "title", None)
        if title:
            metadata["title"] = str(title)
        return ConvertedDocument(
            body, metadata, [], self.name, self.version,
            backend_type=self.backend_type, input_kind=kind, warnings=warnings,
        )


class DoclingHttpConverter:
    """A Docling service over HTTP, for everything the local tools cannot read.

    Uses urllib so the package stays dependency-free; the multipart body is assembled by hand.
    """

    name = "docling-http"
    backend_type = "http"
    version = "1.0.0"

    def __init__(self, base_url: Optional[str] = None, timeout_s: int = 180) -> None:
        self.base_url = (base_url or os.environ.get("DOCLING_URL") or "http://127.0.0.1:5001").rstrip("/")
        self.timeout_s = timeout_s

    def convert(self, path: str) -> ConvertedDocument:
        kind = detect_document_kind(path)
        # Decline CAD/mesh resources before reading them or making a network request.
        if not is_docling_kind(kind):
            raise ExternalConverterRequired(kind)
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
        return ConvertedDocument(
            markdown, metadata, assets, str(data.get("converter") or "docling"), self.version,
            backend_type=self.backend_type, input_kind=kind,
            # Only trust an explicit signal from the service; never guess that OCR happened.
            ocr=bool(data.get("ocr", False)),
            warnings=[str(w) for w in data.get("warnings", [])] if isinstance(data.get("warnings"), list) else [],
        )


class DoclingLocalConverter:
    """Docling in-process, when the optional `docling` extra is installed."""

    name = "docling-local"
    backend_type = "python"

    def __init__(self) -> None:
        self.version = _package_version("docling")
        try:
            from docling.document_converter import DocumentConverter  # type: ignore[import-not-found]
        except ImportError as error:  # pragma: no cover - depends on optional extra
            raise ConversionError("DOCLING_NOT_INSTALLED: pip install 'f2md[docling]'") from error
        self._converter = DocumentConverter()

    def convert(self, path: str) -> ConvertedDocument:
        kind = detect_document_kind(path)
        try:
            with _quiet_stdout():
                result = self._converter.convert(path)
            markdown = result.document.export_to_markdown()
        except Exception as error:  # noqa: BLE001 - surfaced as one conversion failure
            raise ConversionError(f"DOCLING_LOCAL_FAILED:{error}") from error
        metadata = _stat_metadata(path)
        metadata["extractedChars"] = len(markdown)
        return ConvertedDocument(
            markdown, metadata, [], "docling", self.version,
            backend_type=self.backend_type, input_kind=kind,
        )
