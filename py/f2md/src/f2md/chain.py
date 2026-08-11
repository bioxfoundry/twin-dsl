"""The fallback chain: cheapest backend that can do the job wins."""

from __future__ import annotations

import os
import time
from dataclasses import replace
from typing import List, Optional, Sequence

from .converters import (
    Converter,
    DoclingHttpConverter,
    LocalToolConverter,
    MarkItDownConverter,
    PyMuPDFConverter,
    ScadSourceConverter,
    STLMetadataConverter,
    TextConverter,
)
from .detect import is_document_conversion_kind
from .quality import finalize_document
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
        candidates: List[ConvertedDocument] = []
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
            routed = document.with_routing(fallback_depth=depth, duration_ms=elapsed)
            candidate = finalize_document(routed, path)
            quality = candidate.metadata.get("conversionQuality", {})
            status = quality.get("status", "failed") if isinstance(quality, dict) else "failed"
            if not is_document_conversion_kind(candidate.input_kind) or status == "pass":
                if candidates:
                    candidates.append(candidate)
                    return self._select_candidate(candidates, started)
                return candidate
            # A technically successful document conversion may still be unusable canonical
            # Markdown. Keep it as evidence, continue to the next backend, then choose the best
            # deterministic quality score if none reaches PASS.
            candidates.append(candidate)
        if candidates:
            return self._select_candidate(candidates, started)
        if first_real_failure is not None:
            raise first_real_failure
        raise ExternalConverterRequired(kind)

    @staticmethod
    def _select_candidate(candidates: Sequence[ConvertedDocument], started: float) -> ConvertedDocument:
        def score(document: ConvertedDocument) -> int:
            quality = document.metadata.get("conversionQuality", {})
            return int(quality.get("score", 0)) if isinstance(quality, dict) else 0

        selected = max(candidates, key=score)
        arbitration = [
            {
                "converter": candidate.converter,
                "fallbackDepth": candidate.fallback_depth,
                "status": candidate.metadata.get("conversionQuality", {}).get("status", "failed"),
                "score": score(candidate),
            }
            for candidate in candidates
        ]
        metadata = dict(selected.metadata)
        metadata["qualityArbitration"] = {
            "strategy": "highest-quality-score-v1",
            "selected": selected.converter,
            "candidates": arbitration,
        }
        warning = "QUALITY_ARBITRATION:" + selected.converter + ":" + ",".join(
            f"{item['converter']}={item['score']}" for item in arbitration
        )
        return replace(
            selected,
            metadata=metadata,
            duration_ms=int((time.monotonic() - started) * 1000),
            warnings=[*selected.warnings, warning],
        )


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
        ScadSourceConverter(),
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
