"""Compile English Markdown evidence into validated t2c.intent/v1 records.

The deterministic path is the safety baseline. An OpenRouter model may propose richer records,
but its response is accepted only after the same structural validation and is never allowed to
publish a Twin or mutate a project.
"""

from __future__ import annotations

import argparse
import html
import hashlib
import json
import os
import re
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from .llm_patch import PATCH_ENVELOPE_SCHEMA, apply_patch_envelope, patch_messages
from .quality import semantic_blocks


MAX_INTENT_TEXT = 2400
_NAVIGATION_TITLES = {
    "contents", "table of contents", "turinys", "spis treści", "inhalt", "indice",
}
_TECHNICAL_CORRECTIONS = (
    (re.compile(r"\bbiophoundry\b", re.IGNORECASE), "biofoundry"),
    (re.compile(r"\b(?:SLA|Sila|SILA|Silicon|Syla|Susa)\s*2\b"), "SiLA 2"),
    (re.compile(r"\bROM\s*2\b"), "ROS 2"),
    (re.compile(r"\bChemos\s*2(?:\.0)?\b", re.IGNORECASE), "ChemOS 2.0"),
    (re.compile(r"\b(?:Syingebot|Syringot|Syringeot)\b", re.IGNORECASE), "Syringebot"),
    (re.compile(r"\bdark[–-]factor\b", re.IGNORECASE), "dark-factory"),
)
_PICTURE_TRANSCRIPTION = re.compile(
    r"<!--\s*Start of picture text\s*-->.*?<!--\s*End of picture text\s*-->",
    re.IGNORECASE | re.DOTALL,
)


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _file_hash(path: Path) -> str:
    """Hash the addressable artifact bytes; never normalize line endings implicitly."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _file_snapshot(root: Path, paths: Iterable[Path]) -> str:
    """Return a stable content address for generated or source files below *root*."""
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(path.relative_to(root).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _write_version(source: Path, output: Path, source_paths: Iterable[Path], summary: Dict[str, Any]) -> None:
    """Write a deterministic identity for the Markdown-to-DSL conversion."""
    from . import __version__

    sources = list(source_paths)
    packs = [path for path in output.rglob("*.intent.json") if path.is_file()]
    lines = [
        "FORMAT=bioxfoundry.conversion-version/v1",
        "ARTIFACT=markdown-intent-dsl",
        "COMPILER=f2md.intent_compile",
        f"COMPILER_VERSION={__version__}",
        f"SOURCE_FILES={len(sources)}",
        f"SOURCE_SNAPSHOT_SHA256={_file_snapshot(source, sources)}",
        f"OUTPUT_PACKS={len(packs)}",
        f"OUTPUT_SNAPSHOT_SHA256={_file_snapshot(output, packs)}",
        f"INTENT_RECORDS={summary['records']}",
        f"FAILURES={len(summary['failures'])}",
        "",
    ]
    (output / "VERSION").write_text("\n".join(lines), encoding="utf-8")


def refresh_output_identity(output: str | Path) -> Dict[str, Any]:
    """Refresh the generated-output identity after a trusted downstream normalizer.

    A consumer may replace execution-local source paths in intent packs with its own
    logical URIs.  The source identity remains unchanged, while the output snapshot
    must describe the final bytes that cross the file-contract boundary.
    """
    out = Path(output).resolve()
    version_path = out / "VERSION"
    if not version_path.is_file():
        raise ValueError("INTENT_VERSION_MISSING")
    packs = sorted(path for path in out.rglob("*.intent.json") if path.is_file())
    records = 0
    for index, path in enumerate(packs):
        try:
            pack = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise ValueError(f"INVALID_INTENT_PACK_JSON:{path}") from error
        if pack.get("schema") != "t2c.intent-pack/v1":
            raise ValueError(f"INVALID_INTENT_PACK_SCHEMA:{index}")
        records += len(validate_intents(pack.get("records")))

    replacements = {
        "OUTPUT_PACKS": str(len(packs)),
        "OUTPUT_SNAPSHOT_SHA256": _file_snapshot(out, packs),
        "INTENT_RECORDS": str(records),
    }
    original = version_path.read_text(encoding="utf-8").splitlines()
    present: set[str] = set()
    refreshed: List[str] = []
    for line in original:
        key, separator, _value = line.partition("=")
        if separator and key in replacements:
            refreshed.append(f"{key}={replacements[key]}")
            present.add(key)
        else:
            refreshed.append(line)
    missing = sorted(set(replacements) - present)
    if missing:
        raise ValueError("INTENT_VERSION_FIELDS_MISSING:" + ",".join(missing))
    version_path.write_text("\n".join(refreshed).rstrip("\n") + "\n", encoding="utf-8")
    return {
        "packs": len(packs),
        "records": records,
        "outputSnapshotSha256": replacements["OUTPUT_SNAPSHOT_SHA256"],
    }


def _frontmatter(text: str) -> Dict[str, str]:
    if not text.startswith("---\n") or "\n---" not in text[4:]:
        return {}
    block = text[4:text.find("\n---", 4)]
    result: Dict[str, str] = {}
    for line in block.splitlines():
        m = re.match(r"^([A-Za-z][A-Za-z0-9_]*):\s*\"?(.*?)\"?$", line)
        if m:
            result[m.group(1)] = m.group(2)
    return result


def _markdown_body(text: str) -> str:
    """Remove generated front matter without changing canonical body bytes."""
    if not text.startswith("---\n"):
        return text
    end = text.find("\n---\n", 4)
    if end < 0:
        return text
    body = text[end + len("\n---\n"):]
    return body[1:] if body.startswith("\n") else body


def _strip_markdown_markup(value: str) -> str:
    value = value.replace("`", "")
    value = re.sub(r"(?<!\w)[*_]{1,3}(?=\S)", "", value)
    return re.sub(r"(?<=\S)[*_]{1,3}(?!\w)", "", value)


def _heading_key(value: str) -> str:
    value = html.unescape(_strip_markdown_markup(value))
    value = re.sub(
        r"^\s*(?:part\s+)?[IVXLCDM]+(?=\s*(?:[-—:]|\s|$))\s*[-—:]?\s*",
        "", value, flags=re.IGNORECASE,
    )
    value = re.sub(r"^\s*\d+(?:\.\d+)*(?:[.)]\s*|\s+)", "", value)
    return re.sub(r"\s+", " ", value).strip(" :-—").casefold()


def _is_navigation_title(value: str) -> bool:
    return _heading_key(value) in _NAVIGATION_TITLES


def _normalize_technical_terms(value: str, translated: bool) -> str:
    if not translated:
        return value
    # These corrections are deliberately limited to declared translations.  ``SLA`` and ``ROM``
    # may be valid terms in unrelated native English documents, but in translated biofoundry
    # evidence they are observed corruption of SiLA 2 and ROS 2.
    if not re.search(r"bio(?:f|ph)oundry|OpenTwins|ChemOS|SLA\s*2|ROM\s*2|SiLA\s*2", value, re.IGNORECASE):
        return value
    for pattern, replacement in _TECHNICAL_CORRECTIONS:
        value = pattern.sub(replacement, value)
    return value


def _clean_semantic_text(value: str, *, translated: bool = False) -> str:
    value = _PICTURE_TRANSCRIPTION.sub(" ", value)
    value = html.unescape(value)
    value = re.sub(r"<br\s*/?>", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"</?(?:mark|span|div|p|font)(?:\s+[^>]*)?>", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"<!--(?!\s*(?:target-page|source-page):).*?-->", " ", value, flags=re.DOTALL)
    value = _strip_markdown_markup(value)
    value = value.replace("@-@", "-")
    value = _normalize_technical_terms(value, translated)
    return re.sub(r"\s+", " ", value).strip(" :-")


def _intent_type(title: str, text: str, *, first: bool = False) -> str:
    key = _heading_key(title)
    combined = f"{key} {text[:500].casefold()}"
    if re.search(r"\b(plan|roadmap|implementation|deployment|recommendation|procedure|workflow|sequence)\b", combined):
        return "plan"
    if re.search(r"\b(requirement|constraint|policy|safety|security|license|acceptance criteria|shall|must)\b", combined):
        return "decision"
    if re.search(r"\b(conclusion|result|finding|outcome)\b", combined):
        return "result"
    if re.search(r"\b(summary|overview|analysis|comparison|specification|architecture|bill of materials|bom)\b", combined):
        return "report"
    if re.search(r"\b(objective|goal|scope|task|request)\b", key):
        return "request"
    return "report" if first else "claim"


def _text_chunks(value: str, limit: int = MAX_INTENT_TEXT) -> List[str]:
    """Split without dropping evidence; the previous ``[:1200]`` silently lost section tails."""
    value = value.strip()
    if len(value) <= limit:
        return [value] if value else []
    units = re.split(r"(?<=[.!?;])\s+|\s+(?=\|)", value)
    chunks: List[str] = []
    current = ""
    for unit in units:
        unit = unit.strip()
        if not unit:
            continue
        if len(unit) > limit:
            words = unit.split()
            for word in words:
                if len(word) > limit:
                    if current:
                        chunks.append(current)
                        current = ""
                    chunks.extend(word[offset:offset + limit] for offset in range(0, len(word), limit))
                    continue
                if current and len(current) + len(word) + 1 > limit:
                    chunks.append(current)
                    current = ""
                current = f"{current} {word}".strip()
            continue
        if current and len(current) + len(unit) + 1 > limit:
            chunks.append(current)
            current = unit
        else:
            current = f"{current} {unit}".strip()
    if current:
        chunks.append(current)
    return chunks


def _slug(value: str) -> str:
    normalized = re.sub(r"[^\w\s-]", "", _heading_key(value), flags=re.UNICODE)
    return re.sub(r"[\s_-]+", "-", normalized).strip("-") or "evidence"


def _is_noise_line(value: str) -> bool:
    """Reject extraction rulers without treating a skipped line as useful evidence."""
    if len(value) < 20:
        return False
    alphanumeric = sum(character.isalnum() for character in value)
    return alphanumeric / len(value) < 0.05


def _legacy_furniture(body: str) -> set[str]:
    counts: Dict[str, int] = {}
    for line in body.splitlines():
        normalized = _clean_semantic_text(line)
        if 2 < len(normalized) <= 120 and not normalized.startswith("#"):
            counts[normalized] = counts.get(normalized, 0) + 1
    return {line for line, count in counts.items() if count >= 3}


def _structure_path(markdown_path: Path) -> Path:
    value = str(markdown_path)
    stem = value[:-3] if value.endswith(".md") else value
    return Path(stem + ".structure.json")


def _read_structure(markdown_path: Path) -> Optional[Dict[str, Any]]:
    path = _structure_path(markdown_path)
    if not path.is_file():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"DOCUMENT_STRUCTURE_INVALID:{path}") from error
    if not isinstance(value, dict) or value.get("schema") != "bioxfoundry.document-structure/v1":
        raise ValueError(f"DOCUMENT_STRUCTURE_SCHEMA_INVALID:{path}")
    return value


def validate_intents(records: Any) -> List[Dict[str, Any]]:
    if not isinstance(records, list) or not records:
        raise ValueError("T2C_INTENT_ARRAY_REQUIRED")
    allowed_types = {"request", "plan", "decision", "message", "report", "result", "claim"}
    seen: set[str] = set()
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            raise ValueError(f"INVALID_INTENT:{index}")
        required = {"schema", "id", "type", "text", "actor", "targetUris"}
        if set(record) - required - {"ticket", "source"} or not required.issubset(record):
            raise ValueError(f"INVALID_INTENT_KEYS:{index}")
        if record["schema"] != "t2c.intent/v1" or record["type"] not in allowed_types:
            raise ValueError(f"INVALID_INTENT:{index}")
        if (not isinstance(record["id"], str) or not record["id"].strip()
                or record["id"] in seen or not isinstance(record["text"], str)
                or not record["text"].strip() or not isinstance(record["actor"], str)
                or not record["actor"].strip()):
            raise ValueError(f"INVALID_INTENT_ID_OR_TEXT:{index}")
        if (not isinstance(record["targetUris"], list) or not record["targetUris"]
                or not all(isinstance(value, str) and value for value in record["targetUris"])):
            raise ValueError(f"INVALID_INTENT_TARGETS:{index}")
        if "ticket" in record and not isinstance(record["ticket"], str):
            raise ValueError(f"INVALID_INTENT_TICKET:{index}")
        if "source" in record:
            source = record["source"]
            allowed_source = {
                "artifactUri", "revisionHash", "fragment", "page", "lines", "bbox",
                "blockId", "artifactId", "artifactUrn", "evidenceArtifactIds",
                "evidenceArtifactUrns", "converter", "converterVersion",
            }
            if not isinstance(source, dict) or set(source) - allowed_source:
                raise ValueError(f"INVALID_INTENT_SOURCE:{index}")
            required_source = ("artifactUri", "revisionHash", "converter", "converterVersion")
            if not all(isinstance(source.get(key), str) and source[key] for key in required_source):
                raise ValueError(f"INVALID_INTENT_SOURCE:{index}")
            if ("fragment" in source and not isinstance(source["fragment"], str)) or (
                    "page" in source and (not isinstance(source["page"], int) or source["page"] < 1)):
                raise ValueError(f"INVALID_INTENT_SOURCE:{index}")
            if "lines" in source and (not isinstance(source["lines"], list)
                    or len(source["lines"]) != 2
                    or not all(isinstance(value, int) and value >= 1 for value in source["lines"])):
                raise ValueError(f"INVALID_INTENT_SOURCE:{index}")
            if "bbox" in source and (not isinstance(source["bbox"], list)
                    or len(source["bbox"]) != 4
                    or not all(isinstance(value, (int, float)) for value in source["bbox"])):
                raise ValueError(f"INVALID_INTENT_SOURCE:{index}")
            for key in ("blockId", "artifactId", "artifactUrn"):
                if key in source and not isinstance(source[key], str):
                    raise ValueError(f"INVALID_INTENT_SOURCE:{index}")
            for key in ("evidenceArtifactIds", "evidenceArtifactUrns"):
                if key in source and (not isinstance(source[key], list)
                        or not all(isinstance(value, str) for value in source[key])):
                    raise ValueError(f"INVALID_INTENT_SOURCE:{index}")
        seen.add(record["id"])
    return records


def _source_policy(
    root: Path,
    only_english: bool = True,
    allow_degraded: bool = False,
) -> tuple[List[Path], List[Dict[str, str]]]:
    included: List[Path] = []
    excluded: List[Dict[str, str]] = []
    for path in sorted(root.rglob("*.md")):
        if (".git" in path.parts or ".living-runtime" in path.parts
                or any(part.endswith(".artifacts") for part in path.parts)):
            continue
        frontmatter = _frontmatter(path.read_text(encoding="utf-8", errors="replace"))
        language = frontmatter.get("language", "")
        quality_status = frontmatter.get("qualityStatus", "").casefold()
        if only_english and language not in ("", "en", "unknown"):
            excluded.append({"path": path.relative_to(root).as_posix(), "language": language,
                             "reason": "language-policy"})
        elif quality_status == "failed" or (quality_status == "degraded" and not allow_degraded):
            excluded.append({"path": path.relative_to(root).as_posix(), "qualityStatus": quality_status,
                             "reason": "conversion-quality-policy"})
        else:
            included.append(path)
    return included, excluded


def _validate_pack(pack: Any, source_path: Path, pack_path: Path) -> List[Dict[str, Any]]:
    if not isinstance(pack, dict) or pack.get("schema") != "t2c.intent-pack/v1":
        raise ValueError(f"INVALID_INTENT_PACK:{pack_path}")
    if pack.get("sourceHash") != _file_hash(source_path):
        raise ValueError(f"INTENT_SOURCE_HASH_MISMATCH:{source_path}")
    return validate_intents(pack.get("records"))


def compile_markdown(path: str | Path, root: str | Path) -> List[Dict[str, Any]]:
    source = Path(path).resolve()
    base = Path(root).resolve()
    text = source.read_text(encoding="utf-8")
    fm = _frontmatter(text)
    body = _markdown_body(text)
    translated = bool(fm.get("translatedFrom"))
    relative = source.relative_to(base).as_posix()
    source_uri = f"subactor://markdown/{relative}"
    source_digest = _file_hash(source)
    source_anchor = {
        "artifactUri": source_uri,
        "revisionHash": source_digest,
        "fragment": relative,
        "converter": fm.get("converter", "unknown"),
        "converterVersion": fm.get("converterVersion", "unknown"),
    }
    structure = _read_structure(source)
    if structure is not None:
        canonical_hash = str(structure.get("canonicalMarkdownSha256", ""))
        if canonical_hash and canonical_hash != _hash(body):
            raise ValueError(f"DOCUMENT_STRUCTURE_MARKDOWN_MISMATCH:{source}")
        blocks = list(semantic_blocks(structure))
        structured_records: List[Dict[str, Any]] = []
        groups: List[tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]] = []
        active_heading: Optional[Dict[str, Any]] = None
        active_content: List[Dict[str, Any]] = []
        for block in blocks:
            if block.get("type") == "heading":
                if active_heading is not None or active_content:
                    groups.append((active_heading, active_content))
                active_heading, active_content = block, []
            else:
                active_content.append(block)
        if active_heading is not None or active_content:
            groups.append((active_heading, active_content))
        emitted = 0
        for index, (heading, content) in enumerate(groups):
            anchor = heading or (content[0] if content else None)
            if anchor is None:
                continue
            title = _clean_semantic_text(
                str(heading.get("normalizedText", "")) if heading else "Evidence",
                translated=translated,
            )
            if _is_navigation_title(title):
                continue
            semantic_content = [
                block for block in content
                if block.get("semantic") is True and block.get("type") != "heading"
            ]
            # A heading without evidence is navigation, not an assertion such as
            # ``Part III: Part III``.
            if not semantic_content:
                continue
            for content_index, block in enumerate(semantic_content):
                prose = _clean_semantic_text(str(block.get("normalizedText", "")), translated=translated)
                if not prose or _heading_key(prose) == _heading_key(title):
                    continue
                for chunk_index, chunk in enumerate(_text_chunks(prose)):
                    block_id = str(block.get("id", anchor.get("id", f"block-{index}")))
                    text_value = f"{title}: {chunk}" if title and title != "Evidence" else chunk
                    evidence_blocks = ([heading] if heading is not None else []) + [block]
                    record_source = {
                        **source_anchor,
                        "fragment": f"{relative}#{block_id}",
                        "blockId": block_id,
                        "page": block.get("page", anchor.get("page")),
                        "bbox": block.get("bbox", anchor.get("bbox")),
                        "artifactId": block.get("artifactId", anchor.get("artifactId")),
                        "artifactUrn": block.get("artifactUrn", anchor.get("artifactUrn")),
                        "evidenceArtifactIds": [
                            evidence.get("artifactId") for evidence in evidence_blocks
                            if isinstance(evidence, dict) and isinstance(evidence.get("artifactId"), str)
                        ],
                        "evidenceArtifactUrns": [
                            evidence.get("artifactUrn") for evidence in evidence_blocks
                            if isinstance(evidence, dict) and isinstance(evidence.get("artifactUrn"), str)
                        ],
                    }
                    record_source = {
                        key: value for key, value in record_source.items() if value is not None
                    }
                    structured_records.append({
                        "schema": "t2c.intent/v1",
                        "id": _hash(
                            f"{relative}:{block_id}:{content_index}:{chunk_index}:{chunk}"
                        )[:16],
                        "type": _intent_type(title, chunk, first=emitted == 0),
                        "text": text_value,
                        "actor": "source:markdown",
                        "targetUris": [source_uri],
                        "source": record_source,
                    })
                    emitted += 1
        if not structured_records:
            raise ValueError(f"NO_SEMANTIC_BLOCKS:{source}")
        return validate_intents(structured_records)

    headings = list(re.finditer(r"(?m)^(#{1,6})\s+(.+?)\s*$", body))
    records: List[Dict[str, Any]] = []
    furniture = _legacy_furniture(body)
    if headings:
        for index, match in enumerate(headings):
            start = match.end()
            end = headings[index + 1].start() if index + 1 < len(headings) else len(body)
            title = _clean_semantic_text(match.group(2), translated=translated)
            if _is_navigation_title(title):
                continue
            kept_lines = []
            for line in _PICTURE_TRANSCRIPTION.sub("", body[start:end]).splitlines():
                normalized = _clean_semantic_text(line, translated=translated)
                if (not normalized or normalized in furniture or re.fullmatch(r"\d{1,4}", normalized)
                        or _is_noise_line(normalized)):
                    continue
                kept_lines.append(line)
            section = _clean_semantic_text("\n".join(kept_lines), translated=translated)
            if not section or _is_noise_line(section) or _heading_key(section) == _heading_key(title):
                continue
            line_start = body.count("\n", 0, match.start()) + 1
            line_end = body.count("\n", 0, end) + 1
            fragment = f"{relative}#{_slug(title)}-{index + 1}"
            for chunk_index, chunk in enumerate(_text_chunks(section)):
                record_id = _hash(f"{fragment}:{chunk_index}:{chunk}")[:16]
                records.append({
                    "schema": "t2c.intent/v1", "id": record_id,
                    "type": _intent_type(title, chunk, first=not records),
                    "text": f"{title}: {chunk}", "actor": "source:markdown",
                    "targetUris": [source_uri],
                    "source": {**source_anchor, "fragment": fragment, "lines": [line_start, line_end]},
                })
    else:
        prose = _clean_semantic_text(body, translated=translated)
        for chunk_index, chunk in enumerate(_text_chunks(prose or f"Evidence exists in {relative}")):
            fragment = f"{relative}#evidence-{chunk_index + 1}"
            records.append({"schema": "t2c.intent/v1", "id": _hash(fragment + chunk)[:16], "type": "claim",
                            "text": chunk, "actor": "source:markdown", "targetUris": [source_uri],
                            "source": {**source_anchor, "fragment": fragment}})
    if not records:
        raise ValueError(f"NO_SEMANTIC_BLOCKS:{source}")
    return validate_intents(records)


def compile_tree(
    source: str | Path,
    output: str | Path,
    only_english: bool = True,
    allow_degraded: bool = False,
) -> Dict[str, Any]:
    root, out = Path(source).resolve(), Path(output).resolve()
    out.mkdir(parents=True, exist_ok=True)
    expected_targets: set[Path] = set()
    source_paths, exclusions = _source_policy(root, only_english, allow_degraded)
    summary: Dict[str, Any] = {"schema": "subactor.intent-compile-report/v1", "source": str(root),
                               "output": str(out), "languagePolicy": "english-or-unknown" if only_english else "all",
                               "qualityPolicy": "allow-degraded" if allow_degraded else "pass-only",
                               "discoveredMarkdown": len(source_paths) + len(exclusions),
                               "eligibleFiles": len(source_paths), "excludedFiles": len(exclusions),
                               "exclusions": exclusions, "files": 0, "records": 0, "failures": []}
    for path in source_paths:
        try:
            records = compile_markdown(path, root)
            rel = path.relative_to(root)
            target = out / rel.parent / f"{rel.name}.intent.json"
            expected_targets.add(target.resolve())
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps({"schema": "t2c.intent-pack/v1", "source": str(path),
                                          "sourceHash": _file_hash(path), "records": records}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            summary["files"] += 1
            summary["records"] += len(records)
        except (OSError, ValueError) as error:
            summary["failures"].append({"path": str(path), "error": str(error)})
    # The output directory is a generated file contract. Without reconciliation, a file
    # excluded by the current language policy remains visible forever and silently changes
    # downstream intent even though the compile report no longer counts it.
    for generated in out.rglob("*.intent.json"):
        if generated.resolve() not in expected_targets:
            generated.unlink()
    (out / "compile-report.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _write_version(root, out, source_paths, summary)
    return summary


def refresh_contract(source: str | Path, output: str | Path) -> Dict[str, Any]:
    """Recount existing packs and refresh their report/version after a specialised compiler pass."""
    root, out = Path(source).resolve(), Path(output).resolve()
    report_path = out / "compile-report.json"
    summary: Dict[str, Any] = json.loads(report_path.read_text(encoding="utf-8"))
    only_english = summary.get("languagePolicy", "english-or-unknown") != "all"
    allow_degraded = summary.get("qualityPolicy", "pass-only") == "allow-degraded"
    eligible, exclusions = _source_policy(root, only_english, allow_degraded)
    packs = sorted(path for path in out.rglob("*.intent.json") if path.is_file())
    sources: List[Path] = []
    records = 0
    for path in packs:
        pack = json.loads(path.read_text(encoding="utf-8"))
        source_path = Path(str(pack.get("source", ""))).resolve()
        try:
            source_path.relative_to(root)
        except ValueError as error:
            raise ValueError(f"INTENT_SOURCE_OUTSIDE_ROOT:{source_path}") from error
        if not source_path.is_file():
            raise ValueError(f"INTENT_SOURCE_MISSING:{source_path}")
        validated = _validate_pack(pack, source_path, path)
        sources.append(source_path)
        records += len(validated)
    expected_sources = {path.resolve() for path in eligible}
    actual_sources = set(sources)
    if expected_sources != actual_sources:
        missing = sorted(path.relative_to(root).as_posix() for path in expected_sources - actual_sources)
        unexpected = sorted(str(path) for path in actual_sources - expected_sources)
        raise ValueError(f"INTENT_SOURCE_COVERAGE_MISMATCH:missing={missing}:unexpected={unexpected}")
    summary["languagePolicy"] = "english-or-unknown" if only_english else "all"
    summary["qualityPolicy"] = "allow-degraded" if allow_degraded else "pass-only"
    summary["discoveredMarkdown"] = len(eligible) + len(exclusions)
    summary["eligibleFiles"] = len(eligible)
    summary["excludedFiles"] = len(exclusions)
    summary["exclusions"] = exclusions
    summary["files"] = len(packs)
    summary["records"] = records
    report_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _write_version(root, out, sources, summary)
    return summary


def openrouter_proposal(markdown: str, model: Optional[str] = None, target_uri: Optional[str] = None) -> Any:
    """Ask OpenRouter for a proposal only; return the validated records, never apply them."""
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY_MISSING")
    chosen = model or os.environ.get("OPENROUTER_MODEL", "")
    if not chosen:
        raise RuntimeError("OPENROUTER_MODEL_MISSING")
    base: Dict[str, Any] = {"records": []}
    record_schema = {"type": "object", "properties": {"schema": {"const": "t2c.intent/v1"}, "id": {"type": "string"}, "type": {"enum": ["request", "plan", "decision", "message", "report", "result", "claim"]}, "text": {"type": "string"}, "actor": {"type": "string"}, "targetUris": {"type": "array", "items": {"type": "string"}, "minItems": 1}}, "required": ["schema", "id", "type", "text", "actor", "targetUris"], "additionalProperties": False}
    target_schema = {"type": "object", "properties": {"records": {"type": "array", "items": record_schema, "minItems": 1}}, "required": ["records"], "additionalProperties": False}
    task = {"task": "Compile evidence into t2c.intent/v1 proposals. Do not publish, mutate, or invent source URIs.", "targetUri": target_uri, "markdown": markdown[:100000]}
    payload = json.dumps({"model": chosen, "temperature": 0, "messages": patch_messages("intent-compile", task, base, ["records"], target_schema), "response_format": {"type": "json_schema", "json_schema": {"name": "subactor_patch_envelope", "strict": True, "schema": PATCH_ENVELOPE_SCHEMA}}}).encode()
    request = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=payload,
                                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=180) as response:
        envelope = json.loads(response.read().decode())
    content = str(envelope["choices"][0]["message"]["content"]).strip()
    patched = apply_patch_envelope(json.loads(content), "intent-compile", base, ["records"])
    return validate_intents(patched.get("records"))


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="f2md-intent")
    parser.add_argument("source")
    parser.add_argument("output")
    parser.add_argument("--all-languages", action="store_true")
    parser.add_argument(
        "--allow-degraded", action="store_true",
        help="compile DEGRADED conversion candidates (FAILED remains excluded by source policy)",
    )
    parser.add_argument("--refresh-contract", action="store_true",
                        help="recount existing intent packs and refresh report/VERSION only")
    args = parser.parse_args(argv)
    summary = (refresh_contract(args.source, args.output) if args.refresh_contract
               else compile_tree(
                   args.source, args.output,
                   only_english=not args.all_languages,
                   allow_degraded=args.allow_degraded,
               ))
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not summary["failures"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
