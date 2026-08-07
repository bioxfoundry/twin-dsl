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
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, List, Optional, Sequence

from .chain import ConverterChain, default_chain
from .detect import detect_document_kind, media_type_for
from .types import ConversionError

#: Directories never worth walking into.
SKIP_DIRS = frozenset({".git", ".svn", "node_modules", "__pycache__", ".venv", "venv", ".mypy_cache", ".pytest_cache"})


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
    by_converter: Dict[str, int] = field(default_factory=dict)
    failures: List[Dict[str, str]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "converted": self.converted,
            "stubbed": self.stubbed,
            "skipped": self.skipped,
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
) -> TreeResult:
    """Mirror ``src`` into ``out``, converting every file to ``<name>.<ext>.md``.

    ``only`` restricts the run to the given detected kinds (e.g. ``(".pdf",)``).
    ``on_progress`` is called with ``(index, total, relative_path, converter_or_error)``.
    """
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
        target = os.path.join(out, relative + ".md")
        os.makedirs(os.path.dirname(target), exist_ok=True)

        base_fields: Dict[str, Any] = {
            "source": relative,
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
            with open(target, "w", encoding="utf-8") as handle:
                handle.write(front_matter(fields) + body)
            result.stubbed += 1
            result.by_converter["none"] = result.by_converter.get("none", 0) + 1
            result.failures.append({"source": relative, "error": reason[:200]})
            if on_progress:
                on_progress(index, len(paths), relative, f"STUB:{reason[:60]}")
            continue

        fields = {
            **base_fields,
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
        result.by_converter[document.converter] = result.by_converter.get(document.converter, 0) + 1
        if on_progress:
            on_progress(index, len(paths), relative, document.converter)
    return result
