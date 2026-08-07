"""The envelope every converter returns.

Conversion is only half the job: what a downstream index needs is the Markdown *plus* enough
provenance to say where it came from, which backend produced it, and how much work it took to get
there. Keeping that in one shape means a caller never has to branch on which converter ran — and
means a clean text extraction is distinguishable from an OCR guess three steps later.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any, Dict, List

#: How a backend does its work. Useful for capacity planning and for explaining latency:
#: ``stdlib`` is in-process and free, ``binary`` forks a process, ``python`` loads models into
#: this process, ``http`` depends on a remote service being up.
BACKEND_TYPES = ("stdlib", "binary", "python", "http")


class ConversionError(Exception):
    """Base class for every failure this package raises."""


class ExternalConverterRequired(ConversionError):
    """The file needs a backend that is not available or not applicable here.

    Carries the detected kind so the chain can try the next converter, and so a caller that
    catches it can tell "unsupported format" apart from "backend broke".
    """

    def __init__(self, kind: str) -> None:
        super().__init__(f"EXTERNAL_CONVERTER_REQUIRED:{kind}")
        self.kind = kind


@dataclass(frozen=True)
class ConvertedDocument:
    """Markdown plus the provenance needed to trust it."""

    markdown: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    assets: List[str] = field(default_factory=list)
    #: Which backend actually ran: ``deterministic-text``, ``pdftotext``, ``docling``, …
    converter: str = "unknown"
    #: That backend's version, so output changes stay traceable.
    version: str = "0"
    #: One of :data:`BACKEND_TYPES`.
    backend_type: str = "stdlib"
    #: Detected input kind, independent of what the filename claims.
    input_kind: str = ""
    #: Whether this Markdown came from optical recognition rather than an embedded text layer.
    ocr: bool = False
    #: How many backends declined before the one that succeeded. 0 means first choice.
    fallback_depth: int = 0
    #: Wall-clock cost of the conversion, for diagnosing a slow pipeline.
    duration_ms: int = 0
    #: Non-fatal quality signals, e.g. truncation or content the backend could not represent.
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize with the camelCase keys the JavaScript package also emits."""
        return {
            "markdown": self.markdown,
            "metadata": dict(self.metadata),
            "assets": list(self.assets),
            "converter": self.converter,
            "version": self.version,
            "backendType": self.backend_type,
            "inputKind": self.input_kind,
            "ocr": self.ocr,
            "fallbackDepth": self.fallback_depth,
            "durationMs": self.duration_ms,
            "warnings": list(self.warnings),
        }

    def with_routing(self, fallback_depth: int, duration_ms: int) -> "ConvertedDocument":
        """Return a copy carrying the chain-level facts a backend cannot know about itself."""
        return replace(self, fallback_depth=fallback_depth, duration_ms=duration_ms)
