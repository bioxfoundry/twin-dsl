"""f2md — convert any file to a unified Markdown envelope.

    >>> from f2md import convert
    >>> doc = convert("report.pdf")
    >>> doc.converter, doc.markdown[:20]

The core is stdlib-only; PDF/Office support uses `pdftotext`/`pandoc` if present, and anything
else can be routed to a Docling service. Every result carries provenance, so a caller always knows
which backend produced the Markdown.
"""

from __future__ import annotations

__version__ = "0.5.31"

from .chain import ConverterChain, convert, convert_to_markdown, default_chain
from .converters import (
    Converter,
    DoclingHttpConverter,
    DoclingLocalConverter,
    LocalToolConverter,
    MarkItDownConverter,
    PyMuPDFConverter,
    ScadSourceConverter,
    STLMetadataConverter,
    TextConverter,
)
from .detect import (
    BINARY_EXTENSIONS,
    DOCLING_EXTENSIONS,
    DOCUMENT_CONVERSION_EXTENSIONS,
    NON_PROSE_EXTENSIONS,
    MEDIA_TYPES,
    TEXT_EXTENSIONS,
    detect_document_kind,
    is_docling_kind,
    is_document_conversion_kind,
    is_prose_kind,
    is_text_kind,
    media_type_for,
)
from .translate import ArgosTranslator, OpenRouterTranslator, TranslationPolicy, TranslationUnavailable, detect_language
from .types import BACKEND_TYPES, ConversionError, ConvertedDocument, ExternalConverterRequired

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
    "MarkItDownConverter",
    "PyMuPDFConverter",
    "ScadSourceConverter",
    "STLMetadataConverter",
    "BACKEND_TYPES",
    "TranslationPolicy",
    "TranslationUnavailable",
    "ArgosTranslator",
    "OpenRouterTranslator",
    "detect_language",
    "convert",
    "convert_to_markdown",
    "default_chain",
    "detect_document_kind",
    "media_type_for",
    "is_text_kind",
    "is_prose_kind",
    "NON_PROSE_EXTENSIONS",
    "TEXT_EXTENSIONS",
    "BINARY_EXTENSIONS",
    "DOCLING_EXTENSIONS",
    "DOCUMENT_CONVERSION_EXTENSIONS",
    "is_docling_kind",
    "is_document_conversion_kind",
    "MEDIA_TYPES",
]
