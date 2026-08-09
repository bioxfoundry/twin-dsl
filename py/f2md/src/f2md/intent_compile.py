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


def _source_policy(root: Path, only_english: bool = True) -> tuple[List[Path], List[Dict[str, str]]]:
    included: List[Path] = []
    excluded: List[Dict[str, str]] = []
    for path in sorted(root.rglob("*.md")):
        if ".git" in path.parts or ".living-runtime" in path.parts:
            continue
        language = _frontmatter(path.read_text(encoding="utf-8", errors="replace")).get("language", "")
        if only_english and language not in ("", "en", "unknown"):
            excluded.append({"path": path.relative_to(root).as_posix(), "language": language,
                             "reason": "language-policy"})
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
    body = text.split("\n---\n", 1)[-1]
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


def compile_tree(source: str | Path, output: str | Path, only_english: bool = True) -> Dict[str, Any]:
    root, out = Path(source).resolve(), Path(output).resolve()
    out.mkdir(parents=True, exist_ok=True)
    expected_targets: set[Path] = set()
    source_paths, exclusions = _source_policy(root, only_english)
    summary: Dict[str, Any] = {"schema": "subactor.intent-compile-report/v1", "source": str(root),
                               "output": str(out), "languagePolicy": "english-or-unknown" if only_english else "all",
                               "discoveredMarkdown": len(source_paths) + len(exclusions),
                               "eligibleFiles": len(source_paths), "excludedFiles": len(exclusions),
                               "exclusions": exclusions, "files": 0, "records": 0, "failures": []}
    for path in source_paths:
        text = path.read_text(encoding="utf-8", errors="replace")
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
    eligible, exclusions = _source_policy(root, only_english)
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
    base = {"records": []}
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
    parser.add_argument("--refresh-contract", action="store_true",
                        help="recount existing intent packs and refresh report/VERSION only")
    args = parser.parse_args(argv)
    summary = (refresh_contract(args.source, args.output) if args.refresh_contract
               else compile_tree(args.source, args.output, only_english=not args.all_languages))
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if not summary["failures"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
