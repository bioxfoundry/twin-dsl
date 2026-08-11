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

import importlib
import json
import os
import re
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from .llm_patch import PATCH_ENVELOPE_SCHEMA, apply_patch_envelope, patch_messages
from .types import ConversionError

#: Chunk size for translation. Argos degrades on very long inputs and LLMs have context limits;
#: paragraphs are recombined afterwards so Markdown structure survives.
DEFAULT_CHUNK_CHARS = 2500

# Product names and protocol identifiers are evidence, not prose.  Offline NMT used to turn
# ``SiLA 2`` into ``SLA 2``/``Silicon 2`` and ``ROS 2`` into ``ROM 2`` in the canonical project
# study.  Translate the surrounding language while copying these tokens byte-for-byte.
_PROTECTED_TERMS = re.compile(
    r"\b(?:sila_ros|sila_base|sila2python|biofoundry|SiLA(?:\s*2)?|ROS(?:\s*2)?|ChemOS(?:\s*2(?:\.0)?)?|OpenTwins|OSCAR|BIO-SPEC|"
    r"Syringebot|ImSwitch|napari|MoveIt\s*2|Raspberry\s+Pi|Ubuntu|gRPC|mDNS|OpenUSD|"
    r"GLS80|HEPA|ULPA|ElveFlow|NEMA\s*17|RGB-D|Laminar\s+Flow\s+Hood|"
    r"Design[–-]Build[–-]Test[–-]Learn|dark[–-]factory)\b",
    re.IGNORECASE,
)

# Markdown syntax is owned by the converter and is evidence-bearing.  Translating a whole image
# or link lets an NMT engine rewrite both punctuation and the relative asset path.  Inline code
# and HTML tags are equally structural: translate prose around them, never the tokens themselves.
_PROTECTED_MARKDOWN = re.compile(
    r"!\[[^\]\n]*\]\([^\n)]*\)|"
    r"(?<!!)\[[^\]\n]*\]\([^\n)]*\)|"
    r"`[^`\n]+`|"
    r"</?[A-Za-z][^>\n]*>"
)

# Quantitative source evidence is not prose.  Keeping approximate values intact prevents offline
# NMT from hallucinating currency codes (``≈6000 EUR`` became ``PLN 6000 EUR``) or company names
# (``≈3 850`` became ``SmithKline 3 850``).
_PROTECTED_EVIDENCE = re.compile(
    r"≈\s*\d[\d\s.,]*(?:[–-]\s*\d[\d\s.,]*)?(?:\s*(?:EUR|m|mm))?",
    re.IGNORECASE,
)

_KNOWN_TRANSLATION_REPAIRS: Tuple[Tuple[str, re.Pattern[str], str], ...] = (
    ("LAMINAR_FLOW_HOOD", re.compile(r"\bLaminar flow food\b", re.IGNORECASE), "Laminar flow hood"),
    ("APPROX_RANGE", re.compile(r"\bSmithKline\s+3\s*850\s*[-–]\s*7\s*800\b", re.IGNORECASE), "≈3 850–7 800"),
    ("APPROX_PRICE", re.compile(r"\bPLN\s+6000\s+EUR\b", re.IGNORECASE), "≈6000 EUR"),
    ("APPROX_REACH", re.compile(r"\breach\s+\.0,5\s*m\b", re.IGNORECASE), "reach ≈0,5 m"),
    ("SILA_BASE", re.compile(r"\bsila\s+_\s+base\b", re.IGNORECASE), "sila_base"),
)


def _repair_translation(value: str) -> Tuple[str, Tuple[str, ...]]:
    """Repair a small audited corpus of known NMT corruptions and report every applied rule."""
    repaired = value
    applied: List[str] = []
    for code, pattern, replacement in _KNOWN_TRANSLATION_REPAIRS:
        repaired, count = pattern.subn(replacement, repaired)
        if count:
            applied.append(code)
    return repaired, tuple(applied)


def _translated_text(translator: Any, value: str) -> str:
    """Translate prose around protected technical terms without exposing placeholders to NMT."""
    def segment_text(segment: str) -> str:
        if not segment or not segment.strip():
            return segment
        leading = segment[:len(segment) - len(segment.lstrip())]
        trailing = segment[len(segment.rstrip()):]
        translated = str(translator.translate(segment.strip())).strip()
        return leading + translated + trailing

    # Merge syntax and terminology matches in source order.  Syntax wins on overlap, so product
    # names inside a URL or inline-code span are copied once as part of that larger token.
    candidates = sorted(
        [
            *_PROTECTED_MARKDOWN.finditer(value),
            *_PROTECTED_TERMS.finditer(value),
            *_PROTECTED_EVIDENCE.finditer(value),
        ],
        key=lambda match: (match.start(), -(match.end() - match.start())),
    )
    protected: List[Any] = []
    protected_end = -1
    for match in candidates:
        if match.start() < protected_end:
            continue
        protected.append(match)
        protected_end = match.end()

    rendered: List[str] = []
    position = 0
    for match in protected:
        if match.start() > position:
            rendered.append(segment_text(value[position:match.start()]))
        token = match.group(0)
        markdown_link = re.fullmatch(r"(!?)\[([^\]\n]*)\]\(([^\n)]*)\)", token)
        if markdown_link:
            # Labels are prose; destinations and delimiters are converter-owned evidence.
            label = _translated_text(translator, markdown_link.group(2))
            rendered.append(f"{markdown_link.group(1)}[{label}]({markdown_link.group(3)})")
        else:
            rendered.append(token)
        position = match.end()
    if position < len(value):
        rendered.append(segment_text(value[position:]))
    return "".join(rendered) if rendered else segment_text(value)


def _translate_table_row(translator: Any, line: str) -> str:
    """Translate Markdown table cells while preserving column and alignment syntax."""
    cells = line.split("|")
    translated: List[str] = []
    for cell in cells:
        stripped = cell.strip()
        if not stripped or re.fullmatch(r":?-{3,}:?", stripped):
            translated.append(cell)
            continue
        leading = cell[:len(cell) - len(cell.lstrip())]
        trailing = cell[len(cell.rstrip()):]
        fragments = re.split(r"(<br\s*/?>)", stripped, flags=re.IGNORECASE)
        translated_cell = "".join(
            fragment if re.fullmatch(r"<br\s*/?>", fragment, re.IGNORECASE)
            else _translated_text(translator, fragment)
            for fragment in fragments
        )
        translated.append(leading + translated_cell + trailing)
    return "|".join(translated)


class TranslationUnavailable(ConversionError):
    """The requested engine is not usable here — missing library, model or credentials."""


@dataclass(frozen=True)
class Translation:
    text: str
    engine: str
    model: str
    source_language: str
    repairs: Tuple[str, ...] = ()


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
        py3langid: Any = importlib.import_module("py3langid")
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


def _translate_markdown_block(translator: Any, block: str, chunk_chars: int) -> str:
    """Translate one non-code block while retaining Markdown-owned comment and line syntax."""
    stripped = block.strip()
    if stripped.startswith("```"):
        return block
    lines = stripped.splitlines()
    comment_line = re.compile(r"^\s*<!--.*-->\s*$")
    if any(comment_line.fullmatch(line) for line in lines):
        rendered: List[str] = []
        prose: List[str] = []

        def flush() -> None:
            if prose:
                rendered.append(_translate_markdown_block(translator, "\n".join(prose), chunk_chars))
                prose.clear()

        for line in lines:
            if comment_line.fullmatch(line):
                flush()
                rendered.append(line)
            else:
                prose.append(line)
        flush()
        return "\n".join(rendered)
    if lines and all(line.lstrip().startswith("|") for line in lines if line.strip()):
        return "\n".join(_translate_table_row(translator, line) for line in lines)
    heading = re.match(r"^(#{1,6})\s+(.*)$", stripped)
    if heading:
        return f"{heading.group(1)} {_translated_text(translator, heading.group(2))}"
    if lines and all(re.match(r"^\s*(?:[-*+]\s+|\d+[.)]\s+)", line) for line in lines):
        translated_lines = []
        for line in lines:
            marker = re.match(r"^(\s*(?:[-*+]\s+|\d+[.)]\s+))(.*)$", line)
            assert marker is not None
            translated_lines.append(marker.group(1) + _translated_text(translator, marker.group(2)))
        return "\n".join(translated_lines)
    return "\n\n".join(_translated_text(translator, chunk) for chunk in _chunks(block, chunk_chars))


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
            importlib.import_module("argostranslate.package")
            argos_translate: Any = importlib.import_module("argostranslate.translate")
        except ImportError as error:
            raise TranslationUnavailable("ARGOS_NOT_INSTALLED: pip install 'f2md[translate]'") from error

        languages = argos_translate.get_installed_languages()
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
        # Translate prose blocks while keeping Markdown structure owned by the converter. Sending
        # raw Markdown to a neural model lets it rewrite heading markers, list bullets and table
        # pipes (which makes the resulting document invalid even when the prose is translated).
        translated_blocks: List[str] = []
        in_fence = False
        for block in text.split("\n\n"):
            stripped = block.strip()
            if not stripped:
                translated_blocks.append(block)
                continue
            if stripped.startswith("```"):
                # A normal fenced block contains both markers in the same blank-line block.
                # Toggling only on the opening marker caused every later paragraph to be treated
                # as code and silently left untranslated.
                if stripped.count("```") % 2:
                    in_fence = not in_fence
                translated_blocks.append(block)
                continue
            if in_fence or stripped.startswith(":::") or (
                stripped.startswith("<!--") and stripped.endswith("-->")
            ):
                translated_blocks.append(block)
                continue
            translated_blocks.append(_translate_markdown_block(pair, block, self.chunk_chars))
        text, repairs = _repair_translation("\n\n".join(translated_blocks).strip())
        return Translation(text, self.engine, f"argos:{source}-{self.target}", source, repairs)


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
        base = {"text": prompt}
        target_schema = {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"], "additionalProperties": False}
        payload = json.dumps(
            {
                "model": self.model,
                "messages": patch_messages("markdown-translation", {"task": f"Translate text to {self.target}; preserve Markdown exactly and do not summarize."}, base, ["text"], target_schema),
                "temperature": 0,
                "response_format": {"type": "json_schema", "json_schema": {"name": "subactor_patch_envelope", "strict": True, "schema": PATCH_ENVELOPE_SCHEMA}},
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
            content = str(data["choices"][0]["message"]["content"])
            patched = apply_patch_envelope(json.loads(content), "markdown-translation", base, ["text"])
            translated = patched.get("text")
            if not isinstance(translated, str):
                raise ValueError("TRANSLATION_TEXT_REQUIRED")
            return translated
        except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise ConversionError("OPENROUTER_RESPONSE_MALFORMED") from error

    def translate(self, text: str, source: str) -> Translation:
        if not self.available():
            raise TranslationUnavailable("OPENROUTER_API_KEY_MISSING")
        parts = [self._call(chunk) for chunk in _chunks(text, self.chunk_chars)]
        text, repairs = _repair_translation("\n\n".join(p.strip() for p in parts).strip())
        return Translation(text, self.engine, self.model, source, repairs)


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
