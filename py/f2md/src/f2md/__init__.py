"""f2md — convert any file to a unified Markdown envelope.

    >>> from f2md import convert
    >>> doc = convert("report.pdf")
    >>> doc.converter, doc.markdown[:20]

The core is stdlib-only; PDF/Office support uses `pdftotext`/`pandoc` if present, and anything
else can be routed to a Docling service. Every result carries provenance, so a caller always knows
which backend produced the Markdown.
"""

from __future__ import annotations

__version__ = "0.1.0"

from .chain import ConverterChain, convert, convert_to_markdown, default_chain
from .converters import (
    Converter,
    DoclingHttpConverter,
    DoclingLocalConverter,
    LocalToolConverter,
    TextConverter,
)
from .detect import (
    BINARY_EXTENSIONS,
    MEDIA_TYPES,
    TEXT_EXTENSIONS,
    detect_document_kind,
    is_text_kind,
    media_type_for,
)
from .types import ConversionError, ConvertedDocument, ExternalConverterRequired

__all__ = [
    "__version__",
    "ConversionError",
    "ConvertedDocument",
    "ExternalConverterRequired",
    "Converter",
    "ConverterChain",
    "TextConverter",
    "LocalToolConverter",
    "DoclingHttpConverter",
    "DoclingLocalConverter",
    "convert",
    "convert_to_markdown",
    "default_chain",
    "detect_document_kind",
    "media_type_for",
    "is_text_kind",
    "TEXT_EXTENSIONS",
    "BINARY_EXTENSIONS",
    "MEDIA_TYPES",
]
