"""Compile English Markdown evidence into validated t2c.intent/v1 records.

The deterministic path is the safety baseline. An OpenRouter model may propose richer records,
but its response is accepted only after the same structural validation and is never allowed to
publish a Twin or mutate a project.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import urllib.request
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from .llm_patch import PATCH_ENVELOPE_SCHEMA, apply_patch_envelope, patch_messages
from .quality import semantic_blocks


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
        if not isinstance(record["id"], str) or record["id"] in seen or not record["text"]:
            raise ValueError(f"INVALID_INTENT_ID_OR_TEXT:{index}")
        if not isinstance(record["targetUris"], list) or not record["targetUris"] or not all(isinstance(v, str) for v in record["targetUris"]):
            raise ValueError(f"INVALID_INTENT_TARGETS:{index}")
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
        if ".git" in path.parts or ".living-runtime" in path.parts:
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
        for index, (heading, content) in enumerate(groups):
            anchor = heading or (content[0] if content else None)
            if anchor is None:
                continue
            title = str(heading.get("normalizedText", "")).strip() if heading else "Evidence"
            prose = " ".join(str(block.get("normalizedText", "")).strip() for block in content)
            prose = re.sub(r"\s+", " ", prose).strip()
            prose = re.sub(r"[`*_]", "", prose)[:1200]
            text_value = f"{title}: {prose}" if prose else title
            block_id = str(anchor.get("id", f"block-{index}"))
            evidence_blocks = ([heading] if heading is not None else []) + content
            record_source = {
                **source_anchor,
                "fragment": f"{relative}#{block_id}",
                "blockId": block_id,
                "page": anchor.get("page"),
                "bbox": anchor.get("bbox"),
                "artifactId": anchor.get("artifactId"),
                "artifactUrn": anchor.get("artifactUrn"),
                "evidenceArtifactIds": [
                    block.get("artifactId") for block in evidence_blocks
                    if isinstance(block.get("artifactId"), str)
                ],
                "evidenceArtifactUrns": [
                    block.get("artifactUrn") for block in evidence_blocks
                    if isinstance(block.get("artifactUrn"), str)
                ],
            }
            structured_records.append({
                "schema": "t2c.intent/v1",
                "id": _hash(relative + ":" + block_id)[:16],
                "type": "request" if index == 0 else "claim",
                "text": text_value,
                "actor": "source:markdown",
                "targetUris": [source_uri],
                "source": record_source,
            })
        if not structured_records:
            raise ValueError(f"NO_SEMANTIC_BLOCKS:{source}")
        return validate_intents(structured_records)

    headings = list(re.finditer(r"(?m)^(#{1,6})\s+(.+?)\s*$", body))
    records: List[Dict[str, Any]] = []
    if headings:
        for index, match in enumerate(headings):
            start = match.end()
            end = headings[index + 1].start() if index + 1 < len(headings) else len(body)
            section = re.sub(r"\s+", " ", body[start:end]).strip()
            section = re.sub(r"[`*_]", "", section)
            section = section[:1200]
            if not section:
                section = match.group(2).strip()
            record_type = "request" if index == 0 else "claim"
            record_id = f"{_hash(relative + ':' + str(index))[:16]}"
            records.append({
                "schema": "t2c.intent/v1", "id": record_id, "type": record_type,
                "text": f"{match.group(2).strip()}: {section}", "actor": "source:markdown",
                "targetUris": [source_uri], "source": source_anchor,
            })
    else:
        prose = re.sub(r"\s+", " ", body).strip()[:1200]
        records.append({"schema": "t2c.intent/v1", "id": _hash(relative)[:16], "type": "claim",
                        "text": prose or f"Evidence exists in {relative}", "actor": "source:markdown",
                        "targetUris": [source_uri], "source": source_anchor})
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
