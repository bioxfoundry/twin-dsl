"""The envelope every converter returns.

Conversion is only half the job: what a downstream index needs is the Markdown *plus* enough
provenance to say where it came from and which backend produced it. Keeping that in one shape
means a caller never has to branch on which converter ran.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List


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
    converter: str = "unknown"
    version: str = "0"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "markdown": self.markdown,
            "metadata": dict(self.metadata),
            "assets": list(self.assets),
            "converter": self.converter,
            "version": self.version,
        }
