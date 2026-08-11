"""Deterministic canonical-Markdown normalization and quality contracts.

Backends are deliberately treated as extractors.  This module owns the stable projection that is
safe to hand to SSOT and intentDSL: page furniture is removed, layout-only HTML is normalized,
obvious code is fenced, and every semantic block retains a source-page relationship in a sidecar
structure.  No model is involved and no uncertain OCR spelling is silently corrected.
"""

from __future__ import annotations

import hashlib
import html
import json
import math
import os
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from .types import ConvertedDocument
from .document_ast import (
    DOCUMENT_AST_SCHEMA,
    artifact_quality,
    markdown_quality_from_ast,
    render_markdown,
    structure_from_ast,
)

QUALITY_SCHEMA = "bioxfoundry.markdown-quality/v1"
STRUCTURE_SCHEMA = "bioxfoundry.document-structure/v1"

_PAGE_NUMBER = re.compile(r"^\s*(?:page\s+)?\d{1,4}(?:\s*(?:/|of)\s*\d{1,4})?\s*$", re.IGNORECASE)
_HEADING = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
_TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$")
_TABLE_SEPARATOR = re.compile(r"^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$")
_IMAGE = re.compile(r"!\[([^\]]*)\]\(([^)]+)\)")
_MALFORMED_IMAGE = re.compile(
    r"(?m)^\s*!\s+[^\]\n]+\]\s*\([^)]+\)\s*$|^\s*!\[[^\]\n]*\]\s+\([^)]+\)\s*$"
)
_PICTURE_BLOCK = re.compile(
    r"<!--\s*Start of picture text\s*-->(.*?)<!--\s*End of picture text\s*-->",
    re.IGNORECASE | re.DOTALL,
)
_MARK_TAG = re.compile(r"<mark>(.*?)</mark>", re.IGNORECASE | re.DOTALL)
_BR = re.compile(r"\s*<br\s*/?>\s*", re.IGNORECASE)
_SUSPECT_OCR_CASE = re.compile(r"(?<!\w)[ąčęėįšųūžĄČĘĖĮŠŲŪŽ][A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]+")
_FENCE = re.compile(r"(?m)^```([^\n]*)$")
_TOC_TITLES = {
    "contents", "table of contents", "turinys", "spis treści", "spis tresci",
    "inhaltsverzeichnis", "sommaire",
}
_TOC_LEADER = re.compile(r"^(.*?)(?:\.{2,}|\s{2,})\s*(\d{1,4})\s*$")
_ASCII_STRONG = re.compile(
    r"\][ \t]*\|{2,}[ \t]*\[|(?:--+>|<--+)|[┌┐└┘├┤┬┴─│]{2,}|\+[-=]{2,}\+"
)


def _outside_fenced_code(markdown: str) -> str:
    """Return prose-only bytes for checks whose Markdown syntax is meaningless inside code."""
    rendered: List[str] = []
    in_fence = False
    for line in markdown.splitlines():
        if _FENCE.match(line):
            in_fence = not in_fence
            rendered.append("")
        elif in_fence:
            rendered.append("")
        else:
            rendered.append(line)
    return "\n".join(rendered)


@dataclass(frozen=True)
class PageMarkdown:
    """One backend page before canonical rendering."""

    number: int
    markdown: str
    width: Optional[float] = None
    height: Optional[float] = None


@dataclass(frozen=True)
class QualityArtifacts:
    """Canonical Markdown and its two file-contract sidecars."""

    markdown: str
    structure: Dict[str, Any]
    quality: Dict[str, Any]


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _source_hash(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _normalized_margin_line(line: str) -> str:
    value = re.sub(r"[`*_#]", "", line)
    value = re.sub(r"\s+", " ", value).strip().casefold()
    return value


def _edge_indexes(lines: Sequence[str], *, top: bool, limit: int = 4) -> List[int]:
    nonempty = [index for index, line in enumerate(lines) if line.strip()]
    return nonempty[:limit] if top else nonempty[-limit:]


def _repeated_margin_candidates(pages: Sequence[PageMarkdown]) -> set[str]:
    """Find text repeated in page margins, never in arbitrary body positions."""
    if len(pages) < 3:
        return set()
    per_page: List[set[str]] = []
    for page in pages:
        lines = page.markdown.splitlines()
        values: set[str] = set()
        for index in _edge_indexes(lines, top=True) + _edge_indexes(lines, top=False):
            value = _normalized_margin_line(lines[index])
            if 3 <= len(value) <= 180 and not _PAGE_NUMBER.match(value):
                values.add(value)
        per_page.append(values)
    counts = Counter(value for values in per_page for value in values)
    threshold = max(2, math.ceil(len(pages) * 0.55))
    return {value for value, count in counts.items() if count >= threshold}


def _remove_page_furniture(page: PageMarkdown, repeated: set[str]) -> Tuple[PageMarkdown, Dict[str, int]]:
    lines = page.markdown.splitlines()
    edge = set(_edge_indexes(lines, top=True) + _edge_indexes(lines, top=False))
    kept: List[str] = []
    headers = 0
    page_numbers = 0
    for index, line in enumerate(lines):
        normalized = _normalized_margin_line(line)
        if index in edge and normalized in repeated:
            headers += 1
            continue
        if index in edge and _PAGE_NUMBER.match(normalized):
            page_numbers += 1
            continue
        kept.append(line)
    return (
        PageMarkdown(page.number, "\n".join(kept).strip(), page.width, page.height),
        {"pageHeadersFootersRemoved": headers, "pageNumbersRemoved": page_numbers},
    )


def _dehyphenate(value: str) -> Tuple[str, int]:
    """Join only layout-explicit word breaks; semantic hyphens remain untouched."""
    count = 0

    def join(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return match.group(1) + match.group(2)

    # `<br>` is an explicit layout break emitted by the PDF renderer.  Newline joining is limited
    # to lowercase word fragments and is applied only outside fenced code by the caller.
    value = re.sub(r"([^\W\d_]{2,})-\s*<br\s*/?>\s*([^\W\d_]{2,})", join, value, flags=re.IGNORECASE)
    value = re.sub(r"(?m)([^\W\d_]{2,})-\s*\n\s*([^\W\d_A-Z][^\W\d_]*)", join, value)
    return value, count


def _full_mark_line(line: str) -> Optional[List[str]]:
    stripped = line.strip()
    if not stripped or "<mark>" not in stripped.casefold():
        return None
    remainder = _MARK_TAG.sub("", stripped)
    remainder = _BR.sub("", remainder).strip()
    if remainder:
        return None
    values: List[str] = []
    for match in _MARK_TAG.finditer(stripped):
        decoded = html.unescape(match.group(1))
        values.extend(part.rstrip() for part in _BR.split(decoded))
    return values


def _code_language(code: str) -> str:
    sample = code.strip()
    if re.search(r"^\s*(?:<\?xml|</?[A-Za-z][^>]*>)", sample, re.MULTILINE):
        return "xml"
    if sample.startswith(("{", "[")):
        try:
            json.loads(sample)
            return "json"
        except json.JSONDecodeError:
            pass
    if re.search(r"(?m)^\s*(?:from\s+\w+\s+import|import\s+\w+|def\s+\w+\(|class\s+\w+|print\s*\()", sample):
        return "python"
    if re.search(r"(?m)^\s*(?:sudo\s+|pip(?:3)?\s+|apt(?:-get)?\s+|cd\s+|curl\s+|wget\s+|export\s+|python(?:3)?\s+)", sample):
        return "bash"
    return "text"


def _fence_mark_code(markdown: str) -> Tuple[str, int]:
    lines = markdown.splitlines()
    rendered: List[str] = []
    pending: List[str] = []
    groups = 0

    def flush() -> None:
        nonlocal groups
        if not pending:
            return
        code = "\n".join(pending).strip("\n")
        rendered.extend([f"```{_code_language(code)}", code, "```"])
        pending.clear()
        groups += 1

    for line in lines:
        values = _full_mark_line(line)
        if values is not None:
            pending.extend(values)
            continue
        flush()
        rendered.append(line)
    flush()
    return "\n".join(rendered), groups


def _toc_title(value: str) -> bool:
    normalized = re.sub(r"[`*_]", "", value).strip().casefold().rstrip(":")
    return normalized in _TOC_TITLES


def _toc_slug(value: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", value.casefold(), flags=re.UNICODE)
    slug = re.sub(r"[\s_-]+", "-", slug).strip("-")
    return slug


def _toc_entry(value: str, explicit_page: Optional[str] = None) -> Optional[Tuple[str, int]]:
    text = html.unescape(re.sub(r"[`*_]", "", value)).strip().strip("|").strip()
    if explicit_page is None:
        match = _TOC_LEADER.match(text)
        if not match:
            return None
        title, page = match.groups()
    else:
        title = re.sub(r"\.{2,}\s*$", "", text).strip()
        page = explicit_page.strip()
        if not page.isdigit():
            return None
    title = title.strip(" .\t")
    if not title or title.casefold() in {"section", "title", "chapter", "page", "puslapis"}:
        return None
    return title, int(page)


def _toc_table_entries(lines: Sequence[str]) -> List[Tuple[str, int]]:
    entries: List[Tuple[str, int]] = []
    for line in lines:
        if _TABLE_SEPARATOR.match(line):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) >= 2:
            titles = [part.strip() for part in _BR.split(cells[0]) if part.strip()]
            pages = [part.strip() for part in _BR.split(cells[-1]) if part.strip()]
            if titles and len(titles) == len(pages) and all(page.isdigit() for page in pages):
                entries.extend(
                    entry for entry in (
                        _toc_entry(title, page) for title, page in zip(titles, pages)
                    ) if entry is not None
                )
                continue
        for cell in cells:
            entries.extend(
                entry for entry in (_toc_entry(part) for part in _BR.split(cell))
                if entry is not None
            )
    return entries


def _render_toc(entries: Sequence[Tuple[str, int]]) -> List[str]:
    rendered: List[str] = []
    for title, page in entries:
        numbering = re.match(r"^(\d+(?:\.\d+)*)\b", title)
        indent = "  " * numbering.group(1).count(".") if numbering else ""
        slug = _toc_slug(title)
        label = f"[{title}](#{slug})" if slug else title
        rendered.append(f"{indent}- {label} <!-- target-page:{page} -->")
    return rendered


def _normalize_toc(markdown: str) -> Tuple[str, int, int]:
    """Convert a TOC table or dot-leader block to a navigable Markdown list."""
    lines = markdown.splitlines()
    output: List[str] = []
    index = 0
    blocks = 0
    entries_count = 0
    while index < len(lines):
        output.append(lines[index])
        heading = _HEADING.match(lines[index])
        if not heading or not _toc_title(heading.group(2)):
            index += 1
            continue
        start = index + 1
        while start < len(lines) and not lines[start].strip():
            start += 1
        end = start
        entries: List[Tuple[str, int]] = []
        if start < len(lines) and _TABLE_ROW.match(lines[start]):
            while end < len(lines) and (_TABLE_ROW.match(lines[end]) or not lines[end].strip()):
                end += 1
            entries = _toc_table_entries(lines[start:end])
        else:
            while end < len(lines):
                if not lines[end].strip():
                    end += 1
                    continue
                entry = _toc_entry(lines[end])
                if entry is None:
                    break
                entries.append(entry)
                end += 1
        if len(entries) < 2:
            index += 1
            continue
        output.extend([
            "",
            "<!-- f2md-semantic:false type=navigation reason=table-of-contents -->",
            *_render_toc(entries),
            "<!-- /f2md-semantic -->",
        ])
        blocks += 1
        entries_count += len(entries)
        index = end
    return "\n".join(output), blocks, entries_count


def _picture_to_diagram(match: re.Match[str]) -> str:
    text = html.unescape(match.group(1))
    text = _BR.sub("\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return (
        "<!-- f2md-semantic:false type=diagram reason=ocr-transcription -->\n"
        "```text\n"
        f"{text}\n"
        "```\n"
        "<!-- /f2md-semantic -->"
    )


def _ascii_table_is_diagram(lines: Sequence[str]) -> bool:
    if len(lines) < 3:
        return False
    joined = "\n".join(lines)
    strong = bool(_ASCII_STRONG.search(joined))
    bracket_nodes = len(re.findall(r"\[[A-Za-z0-9_.:-]{1,32}\]", joined))
    has_separator = any(_TABLE_SEPARATOR.match(line) for line in lines)
    # A backend may synthesize a Markdown separator for an ASCII diagram.  Only a strong connector
    # survives that case; without a separator, multiple named nodes are sufficient evidence.
    return strong or (not has_separator and bracket_nodes >= 2)


def _classify_ascii_diagrams(markdown: str) -> Tuple[str, int]:
    lines = markdown.splitlines()
    output: List[str] = []
    index = 0
    classified = 0
    in_fence = False
    while index < len(lines):
        if lines[index].startswith("```"):
            in_fence = not in_fence
            output.append(lines[index])
            index += 1
            continue
        if in_fence or not _TABLE_ROW.match(lines[index]):
            output.append(lines[index])
            index += 1
            continue
        end = index + 1
        while end < len(lines) and _TABLE_ROW.match(lines[end]):
            end += 1
        group = lines[index:end]
        if _ascii_table_is_diagram(group):
            output.extend([
                "<!-- f2md-semantic:false type=diagram reason=ascii-art -->",
                "```text",
                *group,
                "```",
                "<!-- /f2md-semantic -->",
            ])
            classified += 1
        else:
            output.extend(group)
        index = end
    return "\n".join(output), classified


def _normalize_tables_and_breaks(markdown: str) -> Tuple[str, int]:
    result: List[str] = []
    removed = 0
    in_fence = False
    for line in markdown.splitlines():
        if line.startswith("```"):
            in_fence = not in_fence
            result.append(line)
            continue
        if in_fence:
            result.append(line)
            continue
        updated, count = _BR.subn(" ", line)
        removed += count
        if not _TABLE_ROW.match(updated):
            indentation_match = re.match(r"^[ \t]*", updated)
            indentation = indentation_match.group(0) if indentation_match else ""
            updated = indentation + re.sub(r"[ \t]{2,}", " ", updated[len(indentation):]).rstrip()
        else:
            updated = updated.rstrip()
        result.append(updated)
    return "\n".join(result), removed


def _heading_level(title: str, original: int, first: bool) -> int:
    if first:
        return 1
    if re.match(r"(?i)^dalis\s+[ivxlcdm\d]+\b", title):
        return 1
    numbered = re.match(r"^(\d+(?:\.\d+)*)(?:[.)])?\s+", title)
    if numbered:
        return min(2 + numbered.group(1).count("."), 6)
    return original


def _normalize_headings(markdown: str) -> Tuple[str, int]:
    lines = markdown.splitlines()
    changed = 0
    previous = 0
    seen = False
    in_fence = False
    for index, line in enumerate(lines):
        if line.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        match = _HEADING.match(line)
        if not match:
            continue
        original = len(match.group(1))
        level = _heading_level(match.group(2), original, not seen)
        if seen and previous and level > previous + 1:
            level = previous + 1
        if level != original:
            lines[index] = "#" * level + " " + match.group(2)
            changed += 1
        previous = level
        seen = True
    return "\n".join(lines), changed


def _table_columns(line: str) -> int:
    return max(0, len(line.strip().strip("|").split("|")))


def _orphan_table_rows(markdown: str) -> int:
    count = 0
    for line in markdown.splitlines():
        if not _TABLE_ROW.match(line) or _TABLE_SEPARATOR.match(line):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        nonempty = [cell for cell in cells if cell]
        if len(cells) >= 3 and len(nonempty) == 1 and len(nonempty[0]) <= 12:
            count += 1
    return count


def _split_leading_table(markdown: str) -> Tuple[List[str], str]:
    lines = markdown.splitlines()
    start = 0
    while start < len(lines) and not lines[start].strip():
        start += 1
    end = start
    while end < len(lines) and _TABLE_ROW.match(lines[end]):
        end += 1
    return lines[start:end], "\n".join(lines[end:]).strip()


def _split_trailing_table(markdown: str) -> Tuple[str, List[str]]:
    lines = markdown.splitlines()
    end = len(lines)
    while end and not lines[end - 1].strip():
        end -= 1
    start = end
    while start and _TABLE_ROW.match(lines[start - 1]):
        start -= 1
    return "\n".join(lines[:start]).strip(), lines[start:end]


def _drop_repeated_table_header(previous: Sequence[str], current: List[str]) -> Tuple[List[str], int]:
    if len(previous) < 2 or len(current) < 2:
        return current, 0
    previous_header = previous[0].strip()
    if current[0].strip() == previous_header and _TABLE_SEPARATOR.match(current[1]):
        return current[2:], 1
    return current, 0


def _join_pages(pages: Sequence[PageMarkdown]) -> Tuple[str, Dict[str, int]]:
    if not pages:
        return "", {"tablesStitched": 0, "repeatedTableHeadersRemoved": 0}
    output = f"<!-- source-page:{pages[0].number} -->\n\n{pages[0].markdown}".strip()
    stitched = 0
    repeated_headers = 0
    for page in pages[1:]:
        before, trailing = _split_trailing_table(output)
        leading, after = _split_leading_table(page.markdown)
        compatible = bool(
            trailing
            and leading
            and _table_columns(trailing[-1]) == _table_columns(leading[0])
        )
        if compatible:
            leading, removed = _drop_repeated_table_header(trailing, leading)
            repeated_headers += removed
            stitched += 1
            table = "\n".join([*trailing, *leading]).strip()
            pieces = [before, table, f"<!-- source-page:{page.number} table-continuation -->", after]
            output = "\n\n".join(piece for piece in pieces if piece)
        else:
            output = output.rstrip() + f"\n\n<!-- source-page:{page.number} -->\n\n" + page.markdown.lstrip()
    return output.strip() + "\n", {
        "tablesStitched": stitched,
        "repeatedTableHeadersRemoved": repeated_headers,
    }


def _blocks(markdown: str, source_hash: str) -> List[Dict[str, Any]]:
    blocks: List[Dict[str, Any]] = []
    lines = markdown.splitlines()
    page = 1
    index = 0
    semantic = True
    semantic_reason: Optional[str] = None
    pending_artifact: Optional[tuple[str, str]] = None
    position = 0

    def add(kind: str, text: str, *, language: Optional[str] = None) -> None:
        nonlocal pending_artifact, position
        value = text.strip()
        if not value:
            return
        identity = _sha256_text(f"{source_hash}:{page}:{kind}:{position}:{value}")[:16]
        block: Dict[str, Any] = {
            "id": f"block-{identity}",
            "type": kind,
            "page": page,
            "bbox": None,
            "semantic": semantic,
            "confidence": None,
            "normalizedText": value,
        }
        if semantic_reason:
            block["reason"] = semantic_reason
        if pending_artifact:
            block["artifactUrn"], block["artifactId"] = pending_artifact
            pending_artifact = None
        if language:
            block["language"] = language
        image = _IMAGE.search(value)
        if image:
            block["asset"] = image.group(2)
            block["alt"] = image.group(1)
        blocks.append(block)
        position += 1

    while index < len(lines):
        line = lines[index]
        anchor = re.match(r"<!--\s*source-page:(\d+)", line)
        if anchor:
            page = int(anchor.group(1))
            index += 1
            continue
        artifact_anchor = re.match(r"<!--\s*artifact:(\S+)\s+id=([^\s>]+)\s*-->", line)
        if artifact_anchor:
            pending_artifact = (artifact_anchor.group(1), artifact_anchor.group(2))
            index += 1
            continue
        if line.startswith("<!-- f2md-semantic:false"):
            semantic = False
            reason = re.search(r"\breason=([^\s>]+)", line)
            semantic_reason = reason.group(1) if reason else None
            index += 1
            continue
        if line.startswith("<!-- /f2md-semantic"):
            semantic = True
            semantic_reason = None
            index += 1
            continue
        heading = _HEADING.match(line)
        if heading:
            add("heading", heading.group(2))
            blocks[-1]["level"] = len(heading.group(1))
            index += 1
            continue
        if line.startswith("```"):
            language = line[3:].strip() or "text"
            end = index + 1
            while end < len(lines) and not lines[end].startswith("```"):
                end += 1
            add("diagram" if not semantic else "code", "\n".join(lines[index + 1:end]), language=language)
            index = min(end + 1, len(lines))
            continue
        if _TABLE_ROW.match(line):
            end = index + 1
            while end < len(lines) and _TABLE_ROW.match(lines[end]):
                end += 1
            add("table", "\n".join(lines[index:end]))
            index = end
            continue
        if _IMAGE.search(line):
            add("figure", line)
            index += 1
            continue
        if re.match(r"^\s*(?:[-*+] |\d+[.)] )", line):
            end = index + 1
            while end < len(lines) and re.match(r"^\s*(?:[-*+] |\d+[.)] )", lines[end]):
                end += 1
            add("list", "\n".join(lines[index:end]))
            index = end
            continue
        if not line.strip() or line.startswith("<!--"):
            index += 1
            continue
        end = index + 1
        while end < len(lines) and lines[end].strip() and not (
            _HEADING.match(lines[end]) or lines[end].startswith("```") or _TABLE_ROW.match(lines[end])
            or _IMAGE.search(lines[end]) or lines[end].startswith("<!--")
        ):
            end += 1
        add("paragraph", "\n".join(lines[index:end]))
        index = end
    return blocks


def _heading_tree_valid(markdown: str) -> bool:
    levels: List[int] = []
    in_fence = False
    for line in markdown.splitlines():
        if line.startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence and (match := _HEADING.match(line)):
            levels.append(len(match.group(1)))
    return not levels or (levels[0] == 1 and all(b <= a + 1 for a, b in zip(levels, levels[1:])))


def _toc_residuals(markdown: str) -> int:
    residuals = 0
    in_toc = False
    for line in markdown.splitlines():
        heading = _HEADING.match(line)
        if heading:
            in_toc = _toc_title(heading.group(2))
            continue
        if not in_toc or not line.strip() or line.lstrip().startswith(("- [", "<!--")):
            continue
        if _TABLE_ROW.match(line) or _TOC_LEADER.match(line.strip()):
            residuals += 1
    return residuals


def _check(identifier: str, ok: bool, actual: Any, expected: Any, severity: str = "fail") -> Dict[str, Any]:
    return {
        "id": identifier,
        "status": "pass" if ok else severity,
        "actual": actual,
        "expected": expected,
    }


def refresh_quality_status(report: Dict[str, Any]) -> None:
    """Recalculate the quality verdict after a deterministic post-processing pass.

    Output-aware passes such as figure materialization run after backend arbitration because they
    need the mirror destination.  Keeping the scoring rule here prevents those passes from
    inventing a second definition of PASS / DEGRADED / FAILED.
    """
    checks = report.get("checks", [])
    if not isinstance(checks, list):
        checks = []
    failures = sum(isinstance(check, dict) and check.get("status") == "fail" for check in checks)
    warnings = sum(isinstance(check, dict) and check.get("status") == "warn" for check in checks)
    score = max(0, 100 - failures * 25 - warnings * 8)
    report["score"] = score
    report["status"] = (
        "failed" if failures >= 2 or score < 50 else "degraded" if failures or warnings else "pass"
    )


def normalize_document(
    markdown: str,
    source_path: str,
    *,
    pages: Optional[Sequence[PageMarkdown]] = None,
    normalize: bool = True,
    ocr_audit: Optional[Dict[str, Any]] = None,
    backend_warnings: Optional[Sequence[str]] = None,
) -> QualityArtifacts:
    """Return canonical Markdown, structure JSON, and MarkdownQualityDSL data."""
    raw = markdown
    raw_picture_blocks = len(_PICTURE_BLOCK.findall(raw))
    raw_mark_tags = len(_MARK_TAG.findall(raw))
    if pages is None:
        # A translated document is derived from canonical Markdown rather than directly from a
        # layout backend.  Its source-page comments are the page contract.  Treating the entire
        # translation as one page made a 30-page study report `pages: 1` while its blocks still
        # carried pages 1..30, and allowed the inconsistent sidecar to claim PASS.
        anchors = list(re.finditer(r"(?m)^<!--\s*source-page:(\d+)(?:\s+[^>]*)?-->\s*$", raw))
        if anchors:
            pages = []
            for index, anchor in enumerate(anchors):
                end = anchors[index + 1].start() if index + 1 < len(anchors) else len(raw)
                pages.append(PageMarkdown(int(anchor.group(1)), raw[anchor.end():end].strip()))
        else:
            parts = raw.split("\f")
            pages = [PageMarkdown(index + 1, part.strip()) for index, part in enumerate(parts) if part.strip()]
    if not pages:
        pages = [PageMarkdown(1, raw)]

    repeated = _repeated_margin_candidates(pages) if normalize else set()
    repaired_pages: List[PageMarkdown] = []
    repairs: Counter[str] = Counter()
    for page in pages:
        repaired, counts = _remove_page_furniture(page, repeated) if normalize else (page, {})
        text = repaired.markdown
        if normalize:
            text = _PICTURE_BLOCK.sub(_picture_to_diagram, text)
            text, dehyphenated = _dehyphenate(text)
            repairs["wordsDehyphenated"] += dehyphenated
            text, fenced = _fence_mark_code(text)
            repairs["codeBlocksFenced"] += fenced
            text, ascii_diagrams = _classify_ascii_diagrams(text)
            repairs["asciiDiagramsClassified"] += ascii_diagrams
            text, toc_blocks, toc_entries = _normalize_toc(text)
            repairs["tocBlocksNormalized"] += toc_blocks
            repairs["tocEntriesNormalized"] += toc_entries
            text, breaks = _normalize_tables_and_breaks(text)
            repairs["htmlBreaksRemoved"] += breaks
        for key, value in counts.items():
            repairs[key] += value
        repaired_pages.append(PageMarkdown(repaired.number, text.strip(), repaired.width, repaired.height))

    if normalize:
        canonical, stitched = _join_pages(repaired_pages)
        repairs.update(stitched)
        canonical, ascii_diagrams = _classify_ascii_diagrams(canonical)
        repairs["asciiDiagramsClassified"] += ascii_diagrams
        canonical, toc_blocks, toc_entries = _normalize_toc(canonical)
        repairs["tocBlocksNormalized"] += toc_blocks
        repairs["tocEntriesNormalized"] += toc_entries
        canonical, headings = _normalize_headings(canonical)
        repairs["headingsNormalized"] += headings
        canonical = re.sub(r"\n{3,}", "\n\n", canonical).strip() + "\n"
    else:
        # A Markdown/source backend already owns its bytes. Analysis may describe them, but the
        # quality layer must not turn pass-through conversion into a rewrite.
        canonical = raw
    source_digest = _source_hash(source_path)
    blocks = _blocks(canonical, source_digest)

    analysis_markdown = _outside_fenced_code(canonical)
    mark_tags = len(_MARK_TAG.findall(analysis_markdown))
    html_breaks = len(_BR.findall(analysis_markdown))
    orphan_rows = _orphan_table_rows(analysis_markdown)
    suspect_tokens = sorted(set(_SUSPECT_OCR_CASE.findall(analysis_markdown)))
    picture_blocks = len(_PICTURE_BLOCK.findall(analysis_markdown))
    fenced = len(_FENCE.findall(canonical)) // 2
    figures = sum(1 for block in blocks if block["type"] == "figure")
    diagrams = sum(1 for block in blocks if block["type"] == "diagram")
    malformed_images = len(_MALFORMED_IMAGE.findall(analysis_markdown))
    heading_valid = _heading_tree_valid(analysis_markdown)
    toc_residuals = _toc_residuals(analysis_markdown)
    raw_ocr = ocr_audit or {}
    raw_pages = raw_ocr.get("ocrPages", [])
    ocr_pages: List[int] = []
    if isinstance(raw_pages, list):
        for value in raw_pages:
            try:
                page_number = int(value)
            except (TypeError, ValueError):
                continue
            if page_number >= 1:
                ocr_pages.append(page_number)
    raw_confidence = raw_ocr.get("ocrConfidence")
    confidence = (
        float(raw_confidence)
        if isinstance(raw_confidence, (int, float)) and 0 <= float(raw_confidence) <= 1
        else None
    )
    ocr = {
        "ocrRequested": bool(raw_ocr.get("ocrRequested", False)),
        "ocrActuallyUsed": bool(raw_ocr.get("ocrActuallyUsed", False)),
        "ocrEngine": str(raw_ocr.get("ocrEngine", "none")),
        "ocrVersion": str(raw_ocr.get("ocrVersion", "unknown")),
        "ocrLanguages": [str(value) for value in raw_ocr.get("ocrLanguages", [])]
        if isinstance(raw_ocr.get("ocrLanguages", []), list) else [],
        "ocrPages": sorted(set(ocr_pages)),
        "ocrRegions": [value for value in raw_ocr.get("ocrRegions", []) if isinstance(value, dict)]
        if isinstance(raw_ocr.get("ocrRegions", []), list) else [],
        "ocrConfidence": confidence,
    }

    ocr_suspect_check = (
        _check("OCR_SUSPECT_TOKENS", not suspect_tokens, len(suspect_tokens), 0, "warn")
        if ocr["ocrActuallyUsed"]
        else {
            "id": "OCR_SUSPECT_TOKENS",
            "status": "not-run",
            "actual": len(suspect_tokens),
            "expected": "OCR actually used",
            "reason": "ocrActuallyUsed=false",
        }
    )
    checks = [
        _check("PAGE_HEADERS", not repeated or repairs["pageHeadersFootersRemoved"] > 0,
               len(repeated), "all repeated page-margin text removed"),
        _check("PAGE_NUMBERS", True, repairs["pageNumbersRemoved"], "separated from visible text"),
        _check("MARK_TAGS", mark_tags == 0, mark_tags, 0),
        _check("HTML_BREAKS", html_breaks == 0, html_breaks, 0),
        _check("TABLE_ORPHAN_CELL", orphan_rows == 0, orphan_rows, 0),
        _check("PICTURE_TEXT_BLOCKS", picture_blocks == 0, picture_blocks, 0),
        _check("FIGURES_LINKED", raw_picture_blocks == 0 or figures >= raw_picture_blocks,
               f"{figures}/{raw_picture_blocks}", f"{raw_picture_blocks}/{raw_picture_blocks}", "warn"),
        _check("MARKDOWN_IMAGE_SYNTAX", malformed_images == 0, malformed_images, 0),
        _check("HEADING_TREE", heading_valid, "valid" if heading_valid else "invalid", "valid"),
        _check("TOC_STRUCTURE", toc_residuals == 0, toc_residuals, 0, "warn"),
        ocr_suspect_check,
        _check("OCR_PROVENANCE", not ocr["ocrActuallyUsed"] or ocr["ocrEngine"] != "none",
               ocr, "actual OCR has an engine"),
    ]
    if raw_mark_tags:
        checks.append(_check("CODE_BLOCK_RECOVERY", repairs["codeBlocksFenced"] > 0,
                             f"{repairs['codeBlocksFenced']} blocks from {raw_mark_tags} mark tags", ">0 blocks"))
    actionable_warnings = [
        warning for warning in (backend_warnings or [])
        if not warning.startswith("BACKEND_DIAGNOSTIC:")
    ]
    if actionable_warnings:
        severity = "fail" if any(
            warning.startswith(("LAYOUT_ONLY:", "TRUNCATED:")) for warning in actionable_warnings
        ) else "warn"
        checks.append(_check("BACKEND_WARNINGS", False, actionable_warnings, [], severity))

    metrics = {
        "pages": len(repaired_pages),
        "blocks": len(blocks),
        "semanticBlocks": sum(bool(block["semantic"]) for block in blocks),
        "tables": sum(block["type"] == "table" for block in blocks),
        "orphanTableRows": orphan_rows,
        "fencedCodeBlocks": fenced,
        "figures": figures,
        "diagrams": diagrams,
        "malformedImages": malformed_images,
        "htmlBreaks": html_breaks,
        "markTags": mark_tags,
        "ocrSuspectTokens": len(suspect_tokens),
        "tocResidualRows": toc_residuals,
    }
    structure = {
        "schema": STRUCTURE_SCHEMA,
        "source": os.path.abspath(source_path),
        "sourceSha256": source_digest,
        "rawMarkdownSha256": _sha256_text(raw),
        "canonicalMarkdownSha256": _sha256_text(canonical),
        "pages": [
            {"number": page.number, "width": page.width, "height": page.height}
            for page in repaired_pages
        ],
        "blocks": blocks,
        "ocr": ocr,
    }
    quality = {
        "schema": QUALITY_SCHEMA,
        "status": "failed",
        "score": 0,
        "sourceSha256": source_digest,
        "canonicalMarkdownSha256": _sha256_text(canonical),
        "metrics": metrics,
        "repairs": dict(sorted(repairs.items())),
        "suspectTokens": suspect_tokens,
        "checks": checks,
    }
    refresh_quality_status(quality)
    return QualityArtifacts(canonical, structure, quality)


def finalize_document(document: ConvertedDocument, source_path: str) -> ConvertedDocument:
    """Attach deterministic quality artifacts to a routed conversion result."""
    metadata = dict(document.metadata)
    document_ast = metadata.get("documentAst")
    if isinstance(document_ast, dict) and document_ast.get("schema") == DOCUMENT_AST_SCHEMA:
        # AST-aware backends have already classified the source layout. Markdown and the legacy
        # structure sidecar are one-way projections; never parse the rendered bytes back into type.
        markdown = render_markdown(document_ast)
        artifact_report = artifact_quality(document_ast)
        structure = structure_from_ast(document_ast, markdown)
        quality = markdown_quality_from_ast(document_ast, markdown, artifact_report)
        metadata["structure"] = structure
        metadata["conversionQuality"] = quality
        metadata["artifactQuality"] = artifact_report
        metadata["ocrAudit"] = structure["ocr"]
        from dataclasses import replace

        warnings = [value for value in document.warnings if not value.startswith("MARKDOWN_QUALITY:")]
        if quality["status"] != "pass":
            warnings.append(f"MARKDOWN_QUALITY:{quality['status'].upper()}:{quality['score']}")
        return replace(
            document, markdown=markdown, metadata=metadata,
            ocr=bool(structure["ocr"]["ocrActuallyUsed"]), warnings=warnings,
        )
    raw_pages = metadata.pop("_f2mdPages", None)
    pages: Optional[List[PageMarkdown]] = None
    if isinstance(raw_pages, list):
        pages = []
        for index, value in enumerate(raw_pages):
            if not isinstance(value, dict) or not isinstance(value.get("markdown"), str):
                continue
            pages.append(PageMarkdown(
                int(value.get("number", index + 1)),
                value["markdown"],
                float(value["width"]) if isinstance(value.get("width"), (int, float)) else None,
                float(value["height"]) if isinstance(value.get("height"), (int, float)) else None,
            ))
    raw_ocr_audit = metadata.get("ocrAudit")
    ocr_audit: Dict[str, Any] = dict(raw_ocr_audit) if isinstance(raw_ocr_audit, dict) else {
            "ocrRequested": False,
            "ocrActuallyUsed": document.ocr,
            "ocrEngine": "unknown" if document.ocr else "none",
        }
    # pymupdf4llm's picture-text markers are direct evidence that OCR supplied a transcription,
    # even when its process-global diagnostic stream omitted the per-page banner.  Keep the audit
    # internally consistent instead of preserving the historical `ocr: false` contradiction.
    if document.converter == "pymupdf4llm" and _PICTURE_BLOCK.search(document.markdown):
        ocr_audit["ocrActuallyUsed"] = True
        if str(ocr_audit.get("ocrEngine", "none")) == "none":
            ocr_audit["ocrEngine"] = "tesseract"
        if not ocr_audit.get("ocrPages") and pages:
            ocr_audit["ocrPages"] = [
                page.number for page in pages if _PICTURE_BLOCK.search(page.markdown)
            ]
    # Source Markdown and code are already canonical input.  They still receive a structure and a
    # quality report, but only document converters are allowed to rewrite their projection.
    normalize = document.input_kind not in {".md", ".markdown"} and document.converter not in {
        "deterministic-text", "scad-source", "stl-metadata",
    }
    artifacts = normalize_document(
        document.markdown,
        source_path,
        pages=pages,
        normalize=normalize,
        ocr_audit=ocr_audit,
        backend_warnings=document.warnings,
    )
    metadata["structure"] = artifacts.structure
    metadata["conversionQuality"] = artifacts.quality
    metadata["ocrAudit"] = artifacts.structure["ocr"]
    from dataclasses import replace

    warnings = list(document.warnings)
    if artifacts.quality["status"] != "pass":
        warning = f"MARKDOWN_QUALITY:{artifacts.quality['status'].upper()}:{artifacts.quality['score']}"
        if warning not in warnings:
            warnings.append(warning)
    return replace(
        document,
        markdown=artifacts.markdown,
        metadata=metadata,
        ocr=bool(artifacts.structure["ocr"]["ocrActuallyUsed"]),
        warnings=warnings,
    )


def render_quality_dsl(report: Dict[str, Any]) -> str:
    """Render the JSON quality contract as a compact, deterministic onlyDSL projection."""
    lines = [
        f"MARKDOWN_QUALITY {report.get('sourceSha256', 'unknown')}",
        f"SCHEMA {report.get('schema', QUALITY_SCHEMA)}",
        f"STATUS {str(report.get('status', 'failed')).upper()}",
        f"SCORE {int(report.get('score', 0))}",
    ]
    metrics = report.get("metrics", {})
    if isinstance(metrics, dict):
        for key in sorted(metrics):
            lines.append(f"METRIC {key} {json.dumps(metrics[key], ensure_ascii=False, separators=(',', ':'))}")
    repairs = report.get("repairs", {})
    if isinstance(repairs, dict):
        for key in sorted(repairs):
            lines.append(f"REPAIR {key} {json.dumps(repairs[key], ensure_ascii=False, separators=(',', ':'))}")
    checks = report.get("checks", [])
    if isinstance(checks, list):
        for check in checks:
            if not isinstance(check, dict):
                continue
            lines.append(
                "CHECK " + str(check.get("id", "UNKNOWN")) + " "
                + str(check.get("status", "fail")).upper() + " "
                + json.dumps(check.get("actual"), ensure_ascii=False, separators=(",", ":"))
            )
    lines.append("END_MARKDOWN_QUALITY")
    return "\n".join(lines) + "\n"


def semantic_blocks(structure: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    """Yield only blocks explicitly admitted to semantic compilation."""
    blocks = structure.get("blocks", [])
    if isinstance(blocks, list):
        for block in blocks:
            if isinstance(block, dict) and block.get("semantic") is True:
                yield block
