"""Deterministic terminal-state accounting for an f2md source tree.

The report is a file contract, not runtime state. It contains no timestamps or host-specific root
paths, so an unchanged tree produces byte-identical JSON and DSL on every run. Whether those bytes
were already present is returned separately to the caller as ``coverage_no_change``.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any, Dict, Sequence

SOURCE_COVERAGE_SCHEMA = "bioxfoundry.source-coverage/v1"
SOURCE_STATES = (
    "converted",
    "binary-provenance",
    "excluded-by-policy",
    "unsupported",
    "quarantined",
    "failed",
)


def file_sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def logical_path(root: str, path: str) -> str:
    relative = os.path.relpath(path, root).replace(os.sep, "/")
    if relative == ".." or relative.startswith("../") or relative.startswith("/"):
        raise ValueError(f"SOURCE_COVERAGE_PATH_ESCAPE:{relative}")
    return relative


def source_record(
    *,
    root: str,
    path: str,
    input_kind: str,
    media_type: str,
    state: str,
    reason_code: str,
    markdown_path: str | None = None,
    converter: str = "none",
    converter_version: str = "unknown",
) -> Dict[str, Any]:
    if state not in SOURCE_STATES:
        raise ValueError(f"SOURCE_COVERAGE_STATE_INVALID:{state}")
    source_hash = file_sha256(path)
    relative = logical_path(root, path)
    parent = str(Path(relative).parent).replace(os.sep, "/")
    return {
        "path": relative,
        "inputKind": input_kind,
        "mediaType": media_type,
        "sourceSha256": source_hash,
        "resourceUri": f"urn:subactor:resource:sha256:{source_hash}"
        if state not in ("excluded-by-policy", "quarantined")
        else None,
        "markdownPath": markdown_path.replace(os.sep, "/") if markdown_path else None,
        "intentUris": [],
        "treeRefs": [parent if parent not in ("", ".") else "."],
        "converter": converter,
        "converterVersion": converter_version,
        "state": state,
        "reasonCode": reason_code,
        "twinRevisionStatus": "not-evaluated",
    }


def build_source_coverage(source_snapshot_sha256: str, records: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    ordered = sorted(
        (dict(record) for record in records),
        key=lambda record: str(record["path"]).encode("utf-8"),
    )
    by_state = {state: sum(record.get("state") == state for record in ordered) for state in SOURCE_STATES}
    terminal = sum(by_state.values())
    if terminal != len(ordered):
        raise ValueError(f"SOURCE_COVERAGE_TERMINAL_MISMATCH:{terminal}:{len(ordered)}")
    material = {
        "schema": SOURCE_COVERAGE_SCHEMA,
        "sourceSnapshotSha256": source_snapshot_sha256,
        "summary": {"discovered": len(ordered), "terminal": terminal, "byState": by_state},
        "records": ordered,
    }
    coverage_hash = hashlib.sha256(
        json.dumps(material, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        "schema": SOURCE_COVERAGE_SCHEMA,
        "sourceSnapshotSha256": source_snapshot_sha256,
        "coverageSha256": coverage_hash,
        "summary": material["summary"],
        "records": ordered,
    }


def render_source_coverage_dsl(report: Dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        f"SOURCE_COVERAGE {report['coverageSha256']}",
        f"SCHEMA {report['schema']}",
        f"SOURCE_SNAPSHOT {report['sourceSnapshotSha256']}",
        f"DISCOVERED {summary['discovered']}",
        f"TERMINAL {summary['terminal']}",
    ]
    for state in SOURCE_STATES:
        lines.append(f"STATE {state} {summary['byState'][state]}")
    for record in report["records"]:
        lines.extend(
            [
                f"SOURCE {json.dumps(record['path'], ensure_ascii=False)}",
                f"  KIND {json.dumps(record['inputKind'], ensure_ascii=False)}",
                f"  MEDIA_TYPE {json.dumps(record['mediaType'], ensure_ascii=False)}",
                f"  SOURCE_SHA256 {record['sourceSha256']}",
                f"  RESOURCE_URI {json.dumps(record['resourceUri'], ensure_ascii=False)}",
                f"  MARKDOWN_PATH {json.dumps(record['markdownPath'], ensure_ascii=False)}",
                f"  INTENT_URIS {json.dumps(record['intentUris'], ensure_ascii=False)}",
                f"  TREE_REFS {json.dumps(record['treeRefs'], ensure_ascii=False)}",
                f"  CONVERTER {json.dumps(record['converter'], ensure_ascii=False)}",
                f"  CONVERTER_VERSION {json.dumps(record['converterVersion'], ensure_ascii=False)}",
                f"  TERMINAL_STATE {record['state']}",
                f"  REASON {record['reasonCode']}",
                f"  TWIN_REVISION {record['twinRevisionStatus']}",
                "END_SOURCE",
            ]
        )
    complete = summary["discovered"] == summary["terminal"]
    lines.extend([f"RESULT {'COMPLETE' if complete else 'INCOMPLETE'}", "END_SOURCE_COVERAGE"])
    return "\n".join(lines) + "\n"


def write_source_coverage(root: str, report: Dict[str, Any]) -> bool:
    """Write JSON and DSL when changed; return whether both exact bytes already existed."""
    os.makedirs(root, exist_ok=True)
    json_path = os.path.join(root, "source-coverage.json")
    dsl_path = os.path.join(root, "source-coverage.dsl")
    json_body = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    dsl_body = render_source_coverage_dsl(report)

    def unchanged(path: str, body: str) -> bool:
        try:
            return Path(path).read_text(encoding="utf-8") == body
        except (FileNotFoundError, UnicodeDecodeError):
            return False

    no_change = unchanged(json_path, json_body) and unchanged(dsl_path, dsl_body)
    if not unchanged(json_path, json_body):
        Path(json_path).write_text(json_body, encoding="utf-8")
    if not unchanged(dsl_path, dsl_body):
        Path(dsl_path).write_text(dsl_body, encoding="utf-8")
    return no_change
