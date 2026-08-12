"""Format detection that survives content-addressed filenames.

Ingestion pipelines routinely rename imports to `report.pdf-9f2c…` or `deck.pptx.part`, which
destroys `os.path.splitext`. Detection therefore scans the basename for a known extension before
falling back to the real suffix.
"""

from __future__ import annotations

import os
from typing import Dict, Tuple

#: Extensions handled without any external tool.
TEXT_EXTENSIONS: Tuple[str, ...] = (
    ".md", ".markdown", ".txt", ".text", ".json", ".jsonl", ".ndjson", ".yaml", ".yml",
    ".toml", ".ini", ".cfg", ".csv", ".tsv", ".xml", ".html", ".htm", ".svg", ".tex", ".rst",
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rb", ".php", ".go", ".rs", ".java",
    ".kt", ".c", ".h", ".cpp", ".hpp", ".cs", ".sh", ".bash", ".zsh", ".sql", ".graphql",
    ".proto",
    ".dockerfile", ".env", ".properties", ".gradle", ".make", ".cmake",
    ".dsl", ".projectdsl", ".mathdsl", ".treedsl", ".twindsl", ".scenedsl", ".resourcedsl", ".dql",
)

#: Binary document/image formats accepted by the deployed Docling service.
DOCLING_EXTENSIONS: Tuple[str, ...] = (
    ".pdf", ".docx", ".doc", ".odt", ".pptx", ".ppt", ".xlsx", ".xls", ".ods", ".odp", ".epub",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".tif", ".tiff", ".bmp",
)

#: Formats for which the document-conversion chain is expected to provide a backend.
DOCUMENT_CONVERSION_EXTENSIONS: Tuple[str, ...] = (*DOCLING_EXTENSIONS, ".rtf")

#: Extensions that require an external backend, checked against the whole basename.
BINARY_EXTENSIONS: Tuple[str, ...] = (
    *DOCUMENT_CONVERSION_EXTENSIONS,
    ".step", ".stp", ".stl", ".f3d", ".scad", ".glb", ".gltf", ".usda", ".usdz", ".ifc", ".dwg", ".dxf",
    ".zip", ".tar", ".gz", ".tgz", ".7z", ".rar",
)

MEDIA_TYPES: Dict[str, str] = {
    ".md": "text/markdown", ".markdown": "text/markdown", ".txt": "text/plain",
    ".json": "application/json", ".jsonl": "application/x-ndjson", ".ndjson": "application/x-ndjson",
    ".yaml": "application/yaml", ".yml": "application/yaml", ".toml": "application/toml",
    ".csv": "text/csv", ".tsv": "text/tab-separated-values", ".xml": "application/xml",
    ".html": "text/html", ".htm": "text/html", ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".odt": "application/vnd.oasis.opendocument.text", ".rtf": "application/rtf",
    ".epub": "application/epub+zip",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".tiff": "image/tiff",
    ".step": "model/step", ".stp": "model/step", ".stl": "model/stl",
    ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
    ".usda": "model/vnd.usda", ".usdz": "model/vnd.usdz+zip", ".ifc": "application/x-step",
    ".zip": "application/zip", ".tar": "application/x-tar", ".gz": "application/gzip",
    # Source files: without these every code file would report application/octet-stream even
    # though the text backend converts them happily.
    ".ts": "text/x-typescript", ".tsx": "text/x-typescript", ".js": "text/javascript",
    ".jsx": "text/javascript", ".mjs": "text/javascript", ".cjs": "text/javascript",
    ".py": "text/x-python", ".rb": "text/x-ruby", ".php": "application/x-httpd-php",
    ".go": "text/x-go", ".rs": "text/x-rust", ".java": "text/x-java-source", ".kt": "text/x-kotlin",
    ".c": "text/x-c", ".h": "text/x-c", ".cpp": "text/x-c++", ".hpp": "text/x-c++", ".cs": "text/x-csharp",
    ".sh": "application/x-sh", ".bash": "application/x-sh", ".zsh": "application/x-sh",
    ".sql": "application/sql", ".graphql": "application/graphql", ".rst": "text/x-rst",
    ".proto": "text/x-protobuf",
    ".tex": "application/x-tex", ".ini": "text/plain", ".cfg": "text/plain", ".env": "text/plain",
}


def detect_document_kind(path: str) -> str:
    """Return the logical extension, tolerating hash/part suffixes.

    ``detect_document_kind("report.pdf-9f2c8a")`` -> ``".pdf"``.
    Longer extensions win, so ``.tar.gz``-style names do not match ``.gz`` prematurely.
    """
    base = os.path.basename(path).lower()
    matches = [ext for ext in (*BINARY_EXTENSIONS, *TEXT_EXTENSIONS) if ext in base]
    if matches:
        return max(matches, key=len)
    return os.path.splitext(base)[1]


def media_type_for(path: str) -> str:
    """Best-effort IANA media type, falling back to a generic binary type."""
    kind = detect_document_kind(path)
    return MEDIA_TYPES.get(kind) or MEDIA_TYPES.get(os.path.splitext(path.lower())[1]) or "application/octet-stream"


def is_docling_kind(kind: str) -> bool:
    """Return whether the deployed Docling HTTP service accepts ``kind``."""
    return kind in DOCLING_EXTENSIONS


def is_document_conversion_kind(kind: str) -> bool:
    """Return whether document conversion is expected for ``kind``."""
    return kind in DOCUMENT_CONVERSION_EXTENSIONS


def is_text_kind(kind: str) -> bool:
    return kind in TEXT_EXTENSIONS


#: Formats whose content is structured data or source code rather than prose. Running a language
#: detector over them produces confident nonsense — a CAD parameter file reads as Dutch, a JSON
#: config as Italian — and acting on that would route the file to a translator that mangles it.
NON_PROSE_EXTENSIONS = frozenset({
    ".json", ".jsonl", ".ndjson", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".xml", ".csv", ".tsv",
    ".svg", ".properties", ".env", ".gradle", ".make", ".cmake", ".dockerfile", ".sql", ".graphql",
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".rb", ".php", ".go", ".rs", ".java",
    ".kt", ".c", ".h", ".cpp", ".hpp", ".cs", ".sh", ".bash", ".zsh",
    ".dsl", ".projectdsl", ".mathdsl", ".treedsl", ".twindsl", ".scenedsl", ".resourcedsl", ".dql",
    ".step", ".stp", ".stl", ".f3d", ".scad", ".glb", ".gltf", ".usda", ".usdz", ".ifc", ".dwg", ".dxf",
})


def is_prose_kind(kind: str) -> bool:
    """Whether language detection is meaningful for this format."""
    return bool(kind) and kind not in NON_PROSE_EXTENSIONS
