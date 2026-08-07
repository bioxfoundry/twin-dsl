"""Language detection and translation to a target language.

Two engines, chosen per document rather than per run:

* **argos** runs entirely on this machine. Nothing leaves the host, which is the only acceptable
  option for documents carrying a confidentiality marking.
* **openrouter** sends the text to a hosted LLM. Better output, but the text leaves the machine —
  so it must never be the engine for a confidential document.

The `hybrid` policy encodes exactly that: confidential documents go to argos, everything else to
the LLM. It is the default policy when translation is enabled, because getting this wrong leaks
data and getting it right costs nothing.
"""

from __future__ import annotations

import json
import os
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from .types import ConversionError

#: Chunk size for translation. Argos degrades on very long inputs and LLMs have context limits;
#: paragraphs are recombined afterwards so Markdown structure survives.
DEFAULT_CHUNK_CHARS = 2500


class TranslationUnavailable(ConversionError):
    """The requested engine is not usable here — missing library, model or credentials."""


@dataclass(frozen=True)
class Translation:
    text: str
    engine: str
    model: str
    source_language: str


def detect_language(text: str, minimum_chars: int = 120) -> Optional[str]:
    """Return an ISO-639-1 code, or None when the text is too short or the detector is absent.

    Detection is deliberately optional: `pip install 'f2md[lang]'`. Without it every document is
    treated as untagged rather than being guessed at, because a wrong language tag is worse than
    no tag — it would route a document to a translator that mangles it.
    """
    sample = (text or "").strip()
    if len(sample) < minimum_chars:
        return None
    try:
        import py3langid  # type: ignore[import-not-found]
    except ImportError:
        return None
    try:
        code, _confidence = py3langid.classify(sample[:6000])
        return str(code)
    except Exception:  # noqa: BLE001 - detection must never break a conversion
        return None


def _chunks(text: str, size: int) -> List[str]:
    """Split on blank lines so Markdown blocks stay intact, then pack up to `size`."""
    out: List[str] = []
    current = ""
    for block in text.split("\n\n"):
        if current and len(current) + len(block) + 2 > size:
            out.append(current)
            current = block
        else:
            current = f"{current}\n\n{block}" if current else block
    if current:
        out.append(current)
    return out or [""]


class ArgosTranslator:
    """Offline neural translation. Nothing leaves this machine."""

    engine = "argos"

    def __init__(self, target: str = "en", chunk_chars: int = DEFAULT_CHUNK_CHARS) -> None:
        self.target = target
        self.chunk_chars = chunk_chars
        self._installed: Dict[Tuple[str, str], Any] = {}

    def _pair(self, source: str) -> Any:
        key = (source, self.target)
        if key in self._installed:
            return self._installed[key]
        try:
            import argostranslate.package  # type: ignore[import-not-found]
            import argostranslate.translate  # type: ignore[import-not-found]
        except ImportError as error:
            raise TranslationUnavailable("ARGOS_NOT_INSTALLED: pip install 'f2md[translate]'") from error

        languages = argostranslate.translate.get_installed_languages()
        origin = next((x for x in languages if x.code == source), None)
        destination = next((x for x in languages if x.code == self.target), None)
        if not origin or not destination:
            raise TranslationUnavailable(f"ARGOS_MODEL_MISSING:{source}->{self.target}")
        translation = origin.get_translation(destination)
        if translation is None:
            raise TranslationUnavailable(f"ARGOS_MODEL_MISSING:{source}->{self.target}")
        self._installed[key] = translation
        return translation

    def translate(self, text: str, source: str) -> Translation:
        pair = self._pair(source)
        parts = [pair.translate(chunk) for chunk in _chunks(text, self.chunk_chars)]
        return Translation("\n\n".join(parts).strip(), self.engine, f"argos:{source}-{self.target}", source)


class OpenRouterTranslator:
    """Hosted LLM translation. The text leaves this machine — never use for confidential input."""

    engine = "openrouter"

    def __init__(
        self,
        target: str = "en",
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        chunk_chars: int = DEFAULT_CHUNK_CHARS * 2,
        timeout_s: int = 180,
    ) -> None:
        self.target = target
        self.model = model or os.environ.get("OPENROUTER_MODEL") or "mistralai/codestral-2508"
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY") or ""
        self.base_url = (base_url or os.environ.get("OPENROUTER_BASE_URL") or "https://openrouter.ai/api/v1").rstrip("/")
        self.chunk_chars = chunk_chars
        self.timeout_s = timeout_s

    def available(self) -> bool:
        return bool(self.api_key)

    def _call(self, prompt: str) -> str:
        payload = json.dumps(
            {
                "model": self.model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            f"Translate the user's Markdown into {self.target}. Preserve Markdown "
                            "structure, headings, tables, lists, code blocks and inline formatting "
                            "exactly. Do not summarise, comment, or add anything. Output only the "
                            "translated Markdown."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0,
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=payload,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "X-Title": "f2md",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_s) as response:
                data = json.loads(response.read().decode("utf-8"))
        except Exception as error:  # noqa: BLE001
            raise ConversionError(f"OPENROUTER_HTTP:{error}") from error
        try:
            return str(data["choices"][0]["message"]["content"])
        except (KeyError, IndexError, TypeError) as error:
            raise ConversionError("OPENROUTER_RESPONSE_MALFORMED") from error

    def translate(self, text: str, source: str) -> Translation:
        if not self.available():
            raise TranslationUnavailable("OPENROUTER_API_KEY_MISSING")
        parts = [self._call(chunk) for chunk in _chunks(text, self.chunk_chars)]
        return Translation("\n\n".join(p.strip() for p in parts).strip(), self.engine, self.model, source)


class TranslationPolicy:
    """Routes each document to an engine.

    ``hybrid`` (the default) keeps confidential documents on the offline engine and sends the rest
    to the LLM. ``argos`` keeps everything offline. ``openrouter`` sends everything out and is
    refused for confidential documents, because a policy that can leak them is not a policy.
    """

    def __init__(self, mode: str = "hybrid", target: str = "en") -> None:
        if mode not in ("hybrid", "argos", "openrouter"):
            raise ConversionError(f"TRANSLATION_POLICY_INVALID:{mode}")
        self.mode = mode
        self.target = target
        self.argos = ArgosTranslator(target)
        self.openrouter = OpenRouterTranslator(target)

    def engine_for(self, confidential: bool) -> str:
        if self.mode == "argos":
            return "argos"
        if self.mode == "openrouter":
            # Refused rather than silently downgraded: the caller asked for something unsafe here.
            if confidential:
                raise TranslationUnavailable("CONFIDENTIAL_REFUSED_FOR_HOSTED_ENGINE")
            return "openrouter"
        return "argos" if confidential else "openrouter"

    def translate(self, text: str, source: str, confidential: bool) -> Translation:
        engine = self.engine_for(confidential)
        if engine == "argos":
            return self.argos.translate(text, source)
        return self.openrouter.translate(text, source)
