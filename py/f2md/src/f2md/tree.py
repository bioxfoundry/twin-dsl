"""Convert a directory tree to a mirrored tree of Markdown files.

``src/a/b/report.pdf`` becomes ``out/a/b/report.pdf.md`` — the original extension is kept before
``.md`` so the output name still says what produced it, and two files that differ only by extension
never collide.

Files the chain cannot convert (CAD meshes, archives, binaries with no text layer) still get a
Markdown file containing the provenance front matter and a stub body. Dropping them would leave a
tree that silently disagrees with its source, which is worse than an explicit "no text layer here".
"""

from __future__ import annotations

import os
import re
import hashlib
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, List, Optional, Sequence

from .chain import ConverterChain, default_chain
from .detect import detect_document_kind, is_prose_kind, media_type_for
from .translate import TranslationPolicy, TranslationUnavailable, detect_language
from .types import ConversionError

#: Marker inserted before ``.md`` for documents matching a confidentiality pattern.
SECRET_SUFFIX = ".secret"

#: Directories never worth walking into.
SKIP_DIRS = frozenset({".git", ".svn", "node_modules", "__pycache__", ".venv", "venv", ".mypy_cache", ".pytest_cache"})


def _tree_snapshot(root: str, paths: Sequence[str]) -> str:
    """Return a stable content address for paths below *root*.

    The relative name is part of the digest: identical bytes moved to a different
    place are a different corpus revision.  Do not include mtimes or timestamps;
    a conversion must have the same version on every machine for the same input.
    """
    digest = hashlib.sha256()
    for path in sorted(paths):
        relative = os.path.relpath(path, root).replace(os.sep, "/")
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        digest.update(b"\0")
    return digest.hexdigest()


def _write_version(source: str, root: str, source_paths: Sequence[str]) -> None:
    """Write the generated mirror's deterministic conversion identity."""
    from . import __version__

    # A mirror can share its directory with runtime receipts or reports.  Only Markdown
    # payloads are conversion output, so unrelated operational files cannot alter this version.
    output_paths = [path for path in walk_files(root) if path.endswith(".md")]
    lines = [
        "FORMAT=bioxfoundry.conversion-version/v1",
        "ARTIFACT=markdown-mirror",
        "CONVERTER=f2md",
        f"CONVERTER_VERSION={__version__}",
        f"SOURCE_FILES={len(source_paths)}",
        f"SOURCE_SNAPSHOT_SHA256={_tree_snapshot(source, source_paths)}",
        f"OUTPUT_FILES={len(output_paths)}",
        f"OUTPUT_SNAPSHOT_SHA256={_tree_snapshot(root, output_paths)}",
        "",
    ]
    with open(os.path.join(root, "VERSION"), "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


def _yaml_scalar(value: Any) -> str:
    """Render a scalar for front matter. Strings are quoted so paths and messages stay safe."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{text}"'


def front_matter(fields: Dict[str, Any]) -> str:
    lines = ["---"]
    for key, value in fields.items():
        if isinstance(value, (list, tuple)):
            if not value:
                lines.append(f"{key}: []")
            else:
                lines.append(f"{key}:")
                lines.extend(f"  - {_yaml_scalar(item)}" for item in value)
        else:
            lines.append(f"{key}: {_yaml_scalar(value)}")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


@dataclass
class TreeResult:
    converted: int = 0
    stubbed: int = 0
    skipped: int = 0
    confidential: int = 0
    translated: int = 0
    by_language: Dict[str, int] = field(default_factory=dict)
    by_converter: Dict[str, int] = field(default_factory=dict)
    failures: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "converted": self.converted,
            "stubbed": self.stubbed,
            "skipped": self.skipped,
            "confidential": self.confidential,
            "translated": self.translated,
            "byLanguage": dict(sorted(self.by_language.items(), key=lambda kv: -kv[1])),
            "byConverter": dict(sorted(self.by_converter.items(), key=lambda kv: -kv[1])),
            "failures": self.failures,
        }


def walk_files(root: str) -> Iterator[str]:
    for directory, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith("."))
        for name in sorted(filenames):
            if name.startswith("."):
                continue
            yield os.path.join(directory, name)


def convert_tree(
    src: str,
    out: str,
    chain: Optional[ConverterChain] = None,
    docling_url: Optional[str] = None,
    on_progress: Optional[Any] = None,
    only: Optional[Sequence[str]] = None,
    secret_pattern: Optional[str] = None,
    translate_to: Optional[str] = None,
    translation_policy: str = "hybrid",
) -> TreeResult:
    """Mirror ``src`` into ``out``, converting every file to ``<name>.<ext>.md``.

    ``only`` restricts the run to the given detected kinds (e.g. ``(".pdf",)``).
    ``on_progress`` is called with ``(index, total, relative_path, converter_or_error)``.

    ``secret_pattern`` is a case-insensitive regex; a document whose text matches it is written as
    ``<name>.<ext>.secret.md`` and flagged in its front matter. There is deliberately **no
    default**: guessing confidentiality misfires in both directions — an academic paper discussing
    "confidential peer review" is not confidential, while a marking in a language the heuristic
    does not know would be missed. The caller states the rule for their corpus.
    """
    secret_re = re.compile(secret_pattern, re.IGNORECASE) if secret_pattern else None
    # The unsuffixed name is always the target language; an original in another language keeps its
    # own code, so `report.docx.md` is English and `report.docx.lt.md` is the Lithuanian source.
    policy = TranslationPolicy(translation_policy, translate_to) if translate_to else None
    src = os.path.abspath(src)
    out = os.path.abspath(out)
    if not os.path.isdir(src):
        raise ConversionError(f"SOURCE_NOT_A_DIRECTORY:{src}")
    if out.startswith(src + os.sep):
        # Writing inside the source would feed generated Markdown back into the next run.
        raise ConversionError(f"OUTPUT_INSIDE_SOURCE:{out}")

    chain = chain or default_chain(docling_url)
    result = TreeResult()
    paths = list(walk_files(src))
    for index, path in enumerate(paths, 1):
        relative = os.path.relpath(path, src)
        kind = detect_document_kind(path)
        if only and kind not in only:
            result.skipped += 1
            continue
        os.makedirs(os.path.dirname(os.path.join(out, relative)), exist_ok=True)

        base_fields: Dict[str, Any] = {
            # Absolute, so a Markdown file still points at its origin after being moved or
            # published somewhere else. The tree-relative form is kept alongside it because that
            # is what mirrors the output layout.
            "source": os.path.abspath(path),
            "sourceRelative": relative,
            "inputKind": kind,
            "mediaType": media_type_for(path),
        }
        try:
            document = chain.convert(path)
        except ConversionError as error:
            # A stub keeps the mirrored tree complete and records why there is no text.
            reason = str(error)
            body = (
                f"# {os.path.basename(path)}\n\n"
                f"No text could be extracted from this file.\n\n"
                f"- reason: `{reason}`\n"
                f"- size: {os.path.getsize(path)} bytes\n"
            )
            fields = {**base_fields, "converter": "none", "converted": False, "error": reason}
            # A stub has no text to match against, so it is never classified as confidential.
            target = os.path.join(out, relative + ".md")
            with open(target, "w", encoding="utf-8") as handle:
                handle.write(front_matter(fields) + body)
            result.stubbed += 1
            result.by_converter["none"] = result.by_converter.get("none", 0) + 1
            result.failures.append({"source": relative, "error": reason[:200]})
            if on_progress:
                on_progress(index, len(paths), relative, f"STUB:{reason[:60]}")
            continue

        secret = bool(secret_re and secret_re.search(document.markdown))
        marker = SECRET_SUFFIX if secret else ""
        # Only prose has a language worth detecting; see NON_PROSE_EXTENSIONS.
        language = detect_language(document.markdown) if is_prose_kind(kind) else None
        if language:
            result.by_language[language] = result.by_language.get(language, 0) + 1

        # A document already in the target language needs no suffix and no translation.
        foreign = bool(policy and language and language != policy.target)
        suffix = f".{language}" if foreign else ""
        target = os.path.join(out, relative + marker + suffix + ".md")
        fields = {
            **base_fields,
            "confidential": secret,
            "language": language or "unknown",
            "converter": document.converter,
            "converterVersion": document.version,
            "backendType": document.backend_type,
            "ocr": document.ocr,
            "fallbackDepth": document.fallback_depth,
            "durationMs": document.duration_ms,
            "size": document.metadata.get("size", 0),
            "mtime": document.metadata.get("mtime", ""),
            "extractedChars": document.metadata.get("extractedChars", len(document.markdown)),
            "converted": True,
            "warnings": list(document.warnings),
        }
        with open(target, "w", encoding="utf-8") as handle:
            handle.write(front_matter(fields) + document.markdown.rstrip() + "\n")
        result.converted += 1
        if secret:
            result.confidential += 1

        if foreign and policy and language:
            translated_path = os.path.join(out, relative + marker + ".md")
            try:
                translation = policy.translate(document.markdown, language, secret)
            except (TranslationUnavailable, ConversionError) as error:
                # Never fail the run: the original is already written and correct. The gap is
                # recorded so a later pass can pick up exactly what is missing.
                fields["translationError"] = str(error)
                with open(target, "w", encoding="utf-8") as handle:
                    handle.write(front_matter(fields) + document.markdown.rstrip() + "\n")
                result.failures.append({"source": relative, "error": f"TRANSLATION:{error}"[:200]})
                if on_progress:
                    on_progress(index, len(paths), relative, f"{document.converter} [{language}] no-translation")
                continue
            translated_fields = {
                **fields,
                "language": policy.target,
                "translatedFrom": language,
                "translationEngine": translation.engine,
                "translationModel": translation.model,
                "translationOf": os.path.basename(target),
            }
            with open(translated_path, "w", encoding="utf-8") as handle:
                handle.write(front_matter(translated_fields) + translation.text.rstrip() + "\n")
            result.translated += 1
        result.by_converter[document.converter] = result.by_converter.get(document.converter, 0) + 1
        if on_progress:
            on_progress(index, len(paths), relative, document.converter)
    _write_version(src, out, paths)
    return result
