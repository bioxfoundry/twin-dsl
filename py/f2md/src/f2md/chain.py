"""The fallback chain: cheapest backend that can do the job wins."""

from __future__ import annotations

import os
from typing import List, Optional, Sequence

from .converters import Converter, DoclingHttpConverter, LocalToolConverter, TextConverter
from .types import ConversionError, ConvertedDocument, ExternalConverterRequired


class ConverterChain:
    """Try each backend in order; skip the ones that say the file is not theirs.

    A backend raising :class:`ExternalConverterRequired` is a routing signal, not a failure, so the
    chain moves on. A backend that *was* the right one but broke raises :class:`ConversionError`,
    which is remembered and re-raised if nothing later succeeds — otherwise a Docling outage would
    surface as the misleading "unsupported format".
    """

    def __init__(self, converters: Sequence[Converter]) -> None:
        if not converters:
            raise ValueError("CONVERTER_CHAIN_EMPTY")
        self.converters = list(converters)

    def convert(self, path: str) -> ConvertedDocument:
        if not os.path.isfile(path):
            raise ConversionError(f"FILE_NOT_FOUND:{path}")
        first_real_failure: Optional[ConversionError] = None
        skipped: List[str] = []
        for converter in self.converters:
            try:
                return converter.convert(path)
            except ExternalConverterRequired as signal:
                skipped.append(getattr(converter, "name", type(converter).__name__))
                kind = signal.kind
                continue
            except ConversionError as failure:
                if first_real_failure is None:
                    first_real_failure = failure
                continue
        if first_real_failure is not None:
            raise first_real_failure
        raise ExternalConverterRequired(kind if skipped else os.path.splitext(path)[1])


def default_chain(docling_url: Optional[str] = None) -> ConverterChain:
    """Text -> local pdftotext/pandoc -> Docling over HTTP.

    Docling joins only when a URL is configured, so the default chain never waits on a service that
    was never meant to be running.
    """
    converters: List[Converter] = [TextConverter(), LocalToolConverter()]
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
