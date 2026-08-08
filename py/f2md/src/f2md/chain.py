"""The fallback chain: cheapest backend that can do the job wins."""

from __future__ import annotations

import os
import time
from typing import List, Optional, Sequence

from .converters import (
    Converter,
    DoclingHttpConverter,
    LocalToolConverter,
    MarkItDownConverter,
    PyMuPDFConverter,
    STLMetadataConverter,
    TextConverter,
)
from .types import ConversionError, ConvertedDocument, ExternalConverterRequired


class ConverterChain:
    """Try each backend in order; skip the ones that say the file is not theirs.

    A backend raising :class:`ExternalConverterRequired` is a routing signal, not a failure, so the
    chain moves on and records the skip. A backend that *was* the right one but broke raises
    :class:`ConversionError`, which is remembered and re-raised if nothing later succeeds —
    otherwise a Docling outage would surface as the misleading "unsupported format".

    The winning document is stamped with ``fallback_depth`` and ``duration_ms``: facts a backend
    cannot know about itself, and the ones that make a slow or badly ordered chain visible.
    """

    def __init__(self, converters: Sequence[Converter]) -> None:
        if not converters:
            raise ValueError("CONVERTER_CHAIN_EMPTY")
        self.converters = list(converters)

    def convert(self, path: str) -> ConvertedDocument:
        if not os.path.isfile(path):
            raise ConversionError(f"FILE_NOT_FOUND:{path}")
        started = time.monotonic()
        first_real_failure: Optional[ConversionError] = None
        declined: List[str] = []
        kind = os.path.splitext(path)[1]
        for depth, converter in enumerate(self.converters):
            try:
                document = converter.convert(path)
            except ExternalConverterRequired as signal:
                kind = signal.kind
                declined.append(getattr(converter, "name", type(converter).__name__))
                continue
            except ConversionError as failure:
                if first_real_failure is None:
                    first_real_failure = failure
                declined.append(getattr(converter, "name", type(converter).__name__))
                continue
            elapsed = int((time.monotonic() - started) * 1000)
            return document.with_routing(fallback_depth=depth, duration_ms=elapsed)
        if first_real_failure is not None:
            raise first_real_failure
        raise ExternalConverterRequired(kind)


def default_chain(docling_url: Optional[str] = None) -> ConverterChain:
    """Markup -> text -> PyMuPDF -> pdftotext/pandoc -> MarkItDown -> Docling over HTTP.

    Specialised backends come before general ones, and every optional backend declines when its
    library is missing, so the same chain works on a bare install and on a fully equipped one.
    Docling joins only when a URL is configured, so the default chain never waits on a service that
    was never meant to be running.
    """
    converters: List[Converter] = [
        # HTML must be claimed before the text backend, or it would be fenced as a code block
        # instead of becoming real Markdown. Declines cleanly when the extra is not installed,
        # and TextConverter then still produces something usable.
        MarkItDownConverter(kinds=MarkItDownConverter.MARKUP),
        TextConverter(),
        # Meshes have no prose; retain deterministic triangle/bounds evidence locally.
        STLMetadataConverter(),
        # Structured Markdown from PDFs that have a text layer; declines scans.
        PyMuPDFConverter(),
        LocalToolConverter(),
        # Broad format coverage, after the format-specific backends have had their turn.
        MarkItDownConverter(),
    ]
    url = docling_url or os.environ.get("DOCLING_URL")
    if url:
        converters.append(DoclingHttpConverter(url))
    return ConverterChain(converters)


def convert(path: str, docling_url: Optional[str] = None) -> ConvertedDocument:
    """Convert one file to Markdown using the default chain."""
    return default_chain(docling_url).convert(path)


def convert_to_markdown(path: str, docling_url: Optional[str] = None) -> str:
    """Convenience wrapper returning only the Markdown body."""
    return convert(path, docling_url).markdown
