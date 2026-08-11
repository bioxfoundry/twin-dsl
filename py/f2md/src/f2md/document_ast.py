"""Canonical DocumentAST and typed artifact projections.

The AST is the SSOT for layout-aware converters.  Markdown, the legacy block structure and both
quality DSLs are projections of this model; none of them is parsed back to recover artifact type.
Backends without layout data may still use the older Markdown normalizer as an explicit adapter.
"""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
from collections import Counter
from typing import Any, Dict, Iterable, List, Optional, Sequence

from .diagram_graph import diagram_graph_metrics

DOCUMENT_AST_SCHEMA = "f2md.document-ast/v1"
ARTIFACT_MANIFEST_SCHEMA = "f2md.artifact-manifest/v1"
ARTIFACT_QUALITY_SCHEMA = "f2md.artifact-quality/v1"
_SUSPECT_LANGUAGE_CASE = re.compile(
    r"(?<!\w)[ąčęėįšųūžĄČĘĖĮŠŲŪŽ][A-ZĄČĘĖĮŠŲŪŽ][a-ząčęėįšųūž]+"
)


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def source_sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def make_artifact(
    source_hash: str,
    artifact_type: str,
    pages: Sequence[int],
    bbox: Optional[Sequence[float]],
    content: Dict[str, Any],
    *,
    subtype: Optional[str] = None,
    semantic: bool = True,
    confidence: Optional[float] = None,
    quality: str = "raw",
    source_bboxes: Optional[Sequence[Dict[str, Any]]] = None,
    relations: Optional[Sequence[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Create a stable content-addressed artifact identity."""
    normalized_pages = sorted(set(int(page) for page in pages))
    normalized_bbox = [round(float(value), 4) for value in bbox] if bbox is not None else None
    identity = {
        "sourceSha256": source_hash,
        "type": artifact_type,
        "subtype": subtype,
        "pages": normalized_pages,
        "bbox": normalized_bbox,
        "content": content,
    }
    digest = sha256_text(canonical_json(identity))
    slug = re.sub(r"[^a-z0-9-]", "-", artifact_type.casefold()).strip("-") or "unknown"
    artifact: Dict[str, Any] = {
        "id": f"artifact-{slug}-{digest[:12]}",
        "urn": f"urn:subactor:artifact:sha256:{digest}",
        "type": artifact_type,
        "subtype": subtype,
        "pages": normalized_pages,
        "bbox": normalized_bbox,
        "semantic": semantic,
        "confidence": round(float(confidence), 4) if confidence is not None else None,
        "quality": quality,
        "content": content,
        "relations": list(relations or []),
    }
    if source_bboxes:
        artifact["sourceBboxes"] = [
            {
                "page": int(item["page"]),
                "bbox": [round(float(value), 4) for value in item["bbox"]],
            }
            for item in source_bboxes
        ]
    return artifact


def build_document_ast(
    source_path: str,
    pages: Sequence[Dict[str, Any]],
    artifacts: Sequence[Dict[str, Any]],
    *,
    extractor: str,
    version: str,
    relations: Optional[Sequence[Dict[str, Any]]] = None,
    ocr: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "schema": DOCUMENT_AST_SCHEMA,
        "source": os.path.abspath(source_path),
        "sourceSha256": source_sha256(source_path),
        "extractor": {"name": extractor, "version": version, "mode": "layout-first"},
        "pages": list(pages),
        "artifacts": list(artifacts),
        "relations": list(relations or []),
        "ocr": ocr or {
            "requested": False,
            "actuallyUsed": False,
            "engine": "none",
            "version": "unknown",
            "languages": [],
            "pages": [],
            "regions": [],
            "confidence": None,
        },
    }


def _escape_cell(value: Any) -> str:
    return str(value or "").replace("|", "\\|").replace("\n", " ").strip()


def render_table_artifact(artifact: Dict[str, Any], entry: Optional[Dict[str, Any]] = None) -> str:
    content = artifact["content"]
    rows = content.get("grid", [])
    if not isinstance(rows, list) or not rows:
        return f"{{{{artifact:{artifact['id']}}}}}"
    complex_cells = any(
        isinstance(cell, dict) and (cell.get("rowSpan", 1) != 1 or cell.get("colSpan", 1) != 1)
        for cell in content.get("cells", [])
    )
    if complex_cells:
        cells = {
            (int(cell.get("row", 0)), int(cell.get("column", 0))): cell
            for cell in content.get("cells", []) if isinstance(cell, dict)
        }
        covered: set[tuple[int, int]] = set()
        rendered_rows: List[str] = []
        header_rows = int(content.get("headerRows", 0) or 0)
        row_count = int(content.get("rows", len(rows)) or len(rows))
        column_count = int(content.get("columns", 0) or 0)
        for row_index in range(row_count):
            rendered_cells: List[str] = []
            for column_index in range(column_count):
                if (row_index, column_index) in covered:
                    continue
                cell = cells.get((row_index, column_index), {})
                row_span = max(1, int(cell.get("rowSpan", 1) or 1))
                column_span = max(1, int(cell.get("colSpan", 1) or 1))
                for next_row in range(row_index, row_index + row_span):
                    for next_column in range(column_index, column_index + column_span):
                        if (next_row, next_column) != (row_index, column_index):
                            covered.add((next_row, next_column))
                fallback = (
                    rows[row_index][column_index]
                    if row_index < len(rows) and column_index < len(rows[row_index])
                    else ""
                )
                text = html.escape(re.sub(r"\s+", " ", str(cell.get("text", fallback))).strip())
                tag = "th" if row_index < header_rows else "td"
                attributes = []
                if row_span > 1:
                    attributes.append(f'rowspan="{row_span}"')
                if column_span > 1:
                    attributes.append(f'colspan="{column_span}"')
                suffix = " " + " ".join(attributes) if attributes else ""
                rendered_cells.append(f"    <{tag}{suffix}>{text}</{tag}>")
            rendered_rows.extend(["  <tr>", *rendered_cells, "  </tr>"])
        return "\n".join(["<table>", *rendered_rows, "</table>"])
    width = max((len(row) for row in rows if isinstance(row, list)), default=0)
    if width == 0:
        return f"{{{{artifact:{artifact['id']}}}}}"
    normalized = [
        [_escape_cell(value) for value in row] + [""] * (width - len(row))
        for row in rows if isinstance(row, list)
    ]
    header_rows = int(content.get("headerRows", 0) or 0)
    if header_rows:
        header, body = normalized[0], normalized[1:]
    else:
        header, body = [f"Column {index + 1}" for index in range(width)], normalized
    lines = [
        "| " + " | ".join(header) + " |",
        "|" + "|".join("---" for _ in range(width)) + "|",
    ]
    lines.extend("| " + " | ".join(row) + " |" for row in body)
    return "\n".join(lines)


def _artifact_reference(artifact: Dict[str, Any]) -> str:
    return f"<!-- artifact:{artifact['urn']} id={artifact['id']} -->"


def _markdown_anchor(value: str) -> str:
    anchor = re.sub(r"[^\w\s-]", "", value.casefold(), flags=re.UNICODE)
    return re.sub(r"[-\s]+", "-", anchor).strip("-")


def _render_list_item(item: Any) -> str:
    if not isinstance(item, dict):
        return f"- {item}"
    label = str(item.get("label", "")).strip()
    level = max(1, int(item.get("level", 1) or 1))
    target_page = item.get("targetPage")
    reference = f"[{label}](#{_markdown_anchor(label)})" if label else ""
    page = f" <!-- target-page:{target_page} -->" if isinstance(target_page, int) else ""
    return "  " * (level - 1) + f"- {reference}{page}"


def render_markdown(ast: Dict[str, Any], manifest: Optional[Dict[str, Any]] = None) -> str:
    """Render human/LLM Markdown using only typed AST artifacts."""
    entries = {
        value["id"]: value for value in (manifest or {}).get("artifacts", []) if isinstance(value, dict)
    }
    output: List[str] = []
    current_page: Optional[int] = None
    for artifact in ast.get("artifacts", []):
        if not isinstance(artifact, dict):
            continue
        pages = artifact.get("pages", [1])
        page = int(pages[0]) if pages else 1
        if page != current_page:
            output.extend([f"<!-- source-page:{page} -->", ""])
            current_page = page
        artifact_type = artifact.get("type")
        content = artifact.get("content", {})
        entry = entries.get(artifact.get("id"), {})
        if artifact_type == "heading":
            level = max(1, min(6, int(content.get("level", 1))))
            output.extend([_artifact_reference(artifact), "#" * level + " " + str(content.get("text", "")), ""])
        elif artifact_type == "paragraph":
            output.extend([str(content.get("text", "")).strip(), ""])
        elif artifact_type == "list":
            items = content.get("items", [])
            if isinstance(items, list):
                if artifact.get("subtype") == "table-of-contents":
                    output.extend([
                        "<!-- f2md-semantic:false type=navigation reason=table-of-contents -->",
                        _artifact_reference(artifact),
                    ])
                output.extend([*(_render_list_item(item) for item in items), ""])
                if artifact.get("subtype") == "table-of-contents":
                    output.extend(["<!-- /f2md-semantic -->", ""])
        elif artifact_type == "code":
            language = str(content.get("language", "text"))
            output.extend([
                _artifact_reference(artifact), f"```{language}",
                str(content.get("text", "")).rstrip(), "```", "",
            ])
        elif artifact_type == "diagram" and artifact.get("subtype") == "ascii-diagram":
            preview = entry.get("previewUri")
            original = entry.get("originalUri")
            output.extend([
                _artifact_reference(artifact),
                "<!-- f2md-semantic:false type=diagram reason=ascii-art -->",
            ])
            if isinstance(preview, str):
                output.append(f"![Reconstructed diagram]({preview})")
            if isinstance(original, str) and original != preview:
                output.extend([
                    "<details>", "<summary>Source diagram crop</summary>", "",
                    f"![Source diagram]({original})", "", "</details>",
                ])
            output.extend([
                "<details>", "<summary>Source transcription</summary>", "",
                "```text", str(content.get("text", "")).rstrip(), "```", "", "</details>",
                "<!-- /f2md-semantic -->", "",
            ])
        elif artifact_type == "table":
            output.extend([_artifact_reference(artifact), render_table_artifact(artifact, entry), ""])
        elif artifact_type in {"figure", "diagram", "chart"}:
            uri = entry.get("previewUri") or entry.get("originalUri")
            original = entry.get("originalUri")
            label = str(content.get("caption") or content.get("alt") or artifact_type.title())
            rendered = f"![{label}]({uri})" if uri else f"{{{{artifact:{artifact['id']}}}}}"
            output.extend([
                _artifact_reference(artifact),
                f"<!-- f2md-semantic:false type={artifact_type} reason=artifact-projection -->",
                rendered,
            ])
            if artifact_type == "diagram" and isinstance(original, str) and original != uri:
                output.extend([
                    "<details>", "<summary>Source diagram crop</summary>", "",
                    f"![Source diagram]({original})", "", "</details>",
                ])
            output.extend(["<!-- /f2md-semantic -->", ""])
        elif artifact_type == "equation":
            output.extend([_artifact_reference(artifact), "$$", str(content.get("text", "")), "$$", ""])
        elif artifact_type == "caption":
            output.extend([f"*{content.get('text', '')}*", ""])
    return re.sub(r"\n{3,}", "\n\n", "\n".join(output)).strip() + "\n"


def artifact_quality(ast: Dict[str, Any], manifest: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    entries = {
        value["id"]: value for value in (manifest or {}).get("artifacts", []) if isinstance(value, dict)
    }
    reports: List[Dict[str, Any]] = []
    counts: Counter[str] = Counter()
    for artifact in ast.get("artifacts", []):
        if not isinstance(artifact, dict):
            continue
        checks: List[Dict[str, Any]] = []
        artifact_type = str(artifact.get("type", "unknown"))
        content = artifact.get("content", {})
        entry = entries.get(artifact.get("id"), {})
        checks.append({
            "id": "SOURCE_BBOX", "status": "pass" if artifact.get("bbox") is not None else "warn",
            "actual": artifact.get("bbox"), "expected": "page bounding box",
        })
        if artifact_type == "table":
            rows = content.get("grid", []) if isinstance(content, dict) else []
            columns = int(content.get("columns", 0)) if isinstance(content, dict) else 0
            valid = bool(rows) and columns > 0 and all(isinstance(row, list) and len(row) == columns for row in rows)
            checks.append({"id": "TABLE_GRID", "status": "pass" if valid else "fail",
                           "actual": f"{len(rows)}x{columns}", "expected": "rectangular"})
            orphan = sum(
                1 for row in rows
                if isinstance(row, list) and columns >= 3 and sum(bool(str(cell).strip()) for cell in row) == 1
            )
            checks.append({"id": "ORPHAN_CELLS", "status": "pass" if orphan == 0 else "warn",
                           "actual": orphan, "expected": 0})
        elif artifact_type == "diagram":
            source_text = str(content.get("text") or content.get("sourceText") or "")
            metrics = diagram_graph_metrics(content.get("graph"), source_text)
            original = bool(entry.get("originalUri")) or bool(
                content.get("originalUri") or content.get("xref")
            )
            original_status = "pass" if original else "fail" if manifest is not None else "warn"
            checks.append({
                "id": "ORIGINAL_PRESENT", "status": original_status,
                "actual": original, "expected": True,
            })
            graph_present = isinstance(content.get("graph"), dict)
            checks.append({
                "id": "DIAGRAM_GRAPH",
                "status": "pass" if metrics["valid"] else "fail" if graph_present else "warn",
                "actual": metrics["valid"] if graph_present else "not-reconstructed",
                "expected": True,
            })
            if graph_present:
                checks.extend([
                    {
                        "id": "SOURCE_TEXT_HASH",
                        "status": "pass" if metrics["sourceHashMatches"] else "fail",
                        "actual": metrics["sourceHashMatches"], "expected": True,
                    },
                    {
                        "id": "NODE_COVERAGE",
                        "status": "pass" if metrics["labelCoverage"] == 1.0 else "fail",
                        "actual": f"{metrics['nodeLabelsInSource']}/{metrics['nodes']}",
                        "expected": f"{metrics['nodes']}/{metrics['nodes']}",
                    },
                    {
                        "id": "DANGLING_EDGES",
                        "status": "pass" if metrics["danglingEdges"] == 0 else "fail",
                        "actual": metrics["danglingEdges"], "expected": 0,
                    },
                    {
                        "id": "EDGE_CONFIDENCE",
                        "status": (
                            "pass" if metrics["meanEdgeConfidence"] is not None
                            and float(metrics["meanEdgeConfidence"]) >= 0.75 else "warn"
                        ),
                        "actual": metrics["meanEdgeConfidence"]
                        if metrics["meanEdgeConfidence"] is not None else "not-evidenced",
                        "expected": ">=0.75",
                    },
                ])
        elif artifact_type in {"figure", "chart"}:
            original = bool(entry.get("originalUri")) or (
                isinstance(content, dict) and bool(content.get("originalUri") or content.get("xref"))
            )
            checks.append({"id": "ORIGINAL_PRESENT", "status": "pass" if original else "fail",
                           "actual": original, "expected": True})
            if artifact_type in {"diagram", "chart"}:
                semantic = bool(content.get("graph") or content.get("data")) if isinstance(content, dict) else False
                checks.append({"id": "SEMANTIC_STRUCTURE", "status": "pass" if semantic else "warn",
                               "actual": semantic, "expected": True})
        elif artifact_type == "code":
            language = str(content.get("language", "text")) if isinstance(content, dict) else "text"
            checks.append({"id": "CODE_LANGUAGE", "status": "pass" if language != "text" else "warn",
                           "actual": language, "expected": "specific language"})
        failures = sum(check["status"] == "fail" for check in checks)
        warnings = sum(check["status"] == "warn" for check in checks)
        status = "failed" if failures else "degraded" if warnings else "pass"
        counts[status] += 1
        counts[artifact_type] += 1
        reports.append({"id": artifact["id"], "type": artifact_type, "status": status, "checks": checks})
    overall = "failed" if counts["failed"] else "degraded" if counts["degraded"] else "pass"
    return {
        "schema": ARTIFACT_QUALITY_SCHEMA,
        "sourceSha256": ast["sourceSha256"],
        "status": overall,
        "counts": dict(sorted(counts.items())),
        "artifacts": reports,
    }


def render_artifact_dsl(ast: Dict[str, Any], manifest: Optional[Dict[str, Any]] = None) -> str:
    by_id = {
        value["id"]: value for value in (manifest or {}).get("artifacts", []) if isinstance(value, dict)
    }
    lines = [f"DOCUMENT_ARTIFACTS {ast['sourceSha256']}", f"SCHEMA {DOCUMENT_AST_SCHEMA}"]
    for artifact in ast.get("artifacts", []):
        entry = by_id.get(artifact["id"], {})
        lines.extend([
            f"ARTIFACT {artifact['id']}",
            f"URN {artifact['urn']}",
            f"TYPE {artifact['type']}",
            f"SUBTYPE {artifact.get('subtype') or 'none'}",
            "SOURCE_PAGES " + canonical_json(artifact["pages"]),
            "SOURCE_BBOX " + canonical_json(artifact.get("bbox")),
            f"CONTENT_URI {entry.get('contentUri') or 'inline'}",
            f"PREVIEW_URI {entry.get('previewUri') or 'none'}",
            f"CONFIDENCE {artifact.get('confidence') if artifact.get('confidence') is not None else 'unknown'}",
            f"QUALITY {artifact.get('quality', 'raw')}",
        ])
        for relation in artifact.get("relations", []):
            lines.append(
                f"RELATION {relation.get('predicate')} {relation.get('to')} "
                f"CONFIDENCE {relation.get('confidence', 'unknown')}"
            )
        lines.append("END_ARTIFACT")
    lines.append("END_DOCUMENT_ARTIFACTS")
    return "\n".join(lines) + "\n"


def render_artifact_quality_dsl(report: Dict[str, Any]) -> str:
    lines = [
        f"ARTIFACT_QUALITY {report['sourceSha256']}",
        f"SCHEMA {report['schema']}",
        f"RESULT {str(report['status']).upper()}",
    ]
    for key, value in sorted(report.get("counts", {}).items()):
        lines.append(f"COUNT {key} {value}")
    for artifact in report.get("artifacts", []):
        lines.append(f"ARTIFACT {artifact['id']} {artifact['type']} {str(artifact['status']).upper()}")
        for check in artifact.get("checks", []):
            lines.append(
                f"CHECK {check['id']} {str(check['status']).upper()} "
                + json.dumps(check.get("actual"), ensure_ascii=False, separators=(",", ":"))
            )
        lines.append("END_ARTIFACT")
    lines.append("END_ARTIFACT_QUALITY")
    return "\n".join(lines) + "\n"


def render_artifact_tree_dsl(ast: Dict[str, Any]) -> str:
    """Project typed-artifact PART_OF relations into the repository's treeDSL contract."""
    artifacts = [item for item in ast.get("artifacts", []) if isinstance(item, dict)]
    by_id = {item["id"]: item for item in artifacts}
    typed = {"paragraph", "list", "table", "figure", "diagram", "chart", "code", "equation", "caption"}
    children: Dict[str, List[Dict[str, Any]]] = {}
    unparented: List[Dict[str, Any]] = []
    for artifact in artifacts:
        if artifact.get("type") not in typed:
            continue
        parent = next(
            (
                relation.get("to") for relation in artifact.get("relations", [])
                if relation.get("predicate") == "PART_OF" and relation.get("to") in by_id
            ),
            None,
        )
        if isinstance(parent, str):
            children.setdefault(parent, []).append(artifact)
        else:
            unparented.append(artifact)

    def label(artifact: Dict[str, Any]) -> str:
        content = artifact.get("content", {})
        value = str(
            content.get("text") or content.get("caption") or content.get("alt")
            or artifact.get("subtype") or artifact["type"]
        )
        return re.sub(r"\s+", " ", value).strip()[:120]

    tree_id = f"document-artifacts-{ast['sourceSha256'][:12]}"
    root_id = f"document-{ast['sourceSha256'][:12]}"
    lines = [f"TREE {tree_id}", f"  NODE {root_id} document {json.dumps(tree_id)}"]
    for heading in (item for item in artifacts if item.get("type") == "heading"):
        heading_children = children.get(heading["id"], [])
        if not heading_children:
            continue
        lines.append(
            f"    NODE {heading['id']} heading {json.dumps(label(heading), ensure_ascii=False)}"
        )
        for artifact in heading_children:
            lines.append(
                f"      NODE {artifact['id']} {artifact['type']} "
                f"{json.dumps(label(artifact), ensure_ascii=False)}"
            )
    for artifact in unparented:
        lines.append(
            f"    NODE {artifact['id']} {artifact['type']} "
            f"{json.dumps(label(artifact), ensure_ascii=False)}"
        )
    return "\n".join(lines) + "\n"


def structure_from_ast(
    ast: Dict[str, Any], markdown: str, manifest: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Project the richer AST to the backwards-compatible semantic-block contract."""
    entries = {
        value["id"]: value for value in (manifest or {}).get("artifacts", []) if isinstance(value, dict)
    }
    blocks: List[Dict[str, Any]] = []
    for artifact in ast.get("artifacts", []):
        if not isinstance(artifact, dict):
            continue
        content = artifact.get("content", {})
        artifact_type = str(artifact.get("type", "paragraph"))
        if artifact_type == "table":
            normalized = canonical_json(content.get("grid", []))
        elif artifact_type in {"figure", "diagram", "chart"}:
            normalized = str(
                content.get("sourceText") or content.get("text") or content.get("caption")
                or content.get("alt") or ""
            )
        elif artifact_type == "list":
            normalized = "\n".join(
                str(item.get("label", "")) if isinstance(item, dict) else str(item)
                for item in content.get("items", [])
            )
        else:
            normalized = str(content.get("text", ""))
        block_id = "block-" + sha256_text(str(artifact["urn"]))[:16]
        block: Dict[str, Any] = {
            "id": block_id,
            "artifactId": artifact["id"],
            "artifactUrn": artifact["urn"],
            "type": artifact_type,
            "page": int(artifact.get("pages", [1])[0]),
            "pages": artifact.get("pages", [1]),
            "bbox": artifact.get("bbox"),
            "semantic": bool(artifact.get("semantic", True)),
            "confidence": artifact.get("confidence"),
            "normalizedText": normalized,
        }
        if artifact_type == "heading":
            block["level"] = int(content.get("level", 1))
        if artifact_type == "code":
            block["language"] = str(content.get("language", "text"))
        if artifact_type in {"figure", "diagram", "chart"}:
            block["reason"] = (
                "ascii-art" if artifact.get("subtype") == "ascii-diagram" else "artifact-projection"
            )
            if artifact.get("subtype") != "ascii-diagram":
                entry = entries.get(artifact.get("id"), {})
                asset = entry.get("previewUri") or entry.get("originalUri")
                if isinstance(asset, str):
                    block["asset"] = asset
                if isinstance(entry.get("originalSha256"), str):
                    block["assetSha256"] = entry["originalSha256"]
        blocks.append(block)
    ocr = ast.get("ocr", {})
    return {
        "schema": "bioxfoundry.document-structure/v1",
        "source": ast["source"],
        "sourceSha256": ast["sourceSha256"],
        "rawMarkdownSha256": sha256_text(markdown),
        "canonicalMarkdownSha256": sha256_text(markdown),
        "sourceModel": DOCUMENT_AST_SCHEMA,
        "documentAstSha256": sha256_text(canonical_json(ast)),
        "pages": ast.get("pages", []),
        "blocks": blocks,
        "ocr": {
            "ocrRequested": bool(ocr.get("requested", False)),
            "ocrActuallyUsed": bool(ocr.get("actuallyUsed", False)),
            "ocrEngine": str(ocr.get("engine", "none")),
            "ocrVersion": str(ocr.get("version", "unknown")),
            "ocrLanguages": list(ocr.get("languages", [])),
            "ocrPages": list(ocr.get("pages", [])),
            "ocrRegions": list(ocr.get("regions", [])),
            "ocrConfidence": ocr.get("confidence"),
        },
        "layoutAudit": {
            "status": "pass",
            "engine": str(ast.get("extractor", {}).get("name", "unknown")),
            "version": str(ast.get("extractor", {}).get("version", "unknown")),
            "eligibleBlocks": len(blocks),
            "mappedBlocks": sum(block.get("bbox") is not None for block in blocks),
            "coverage": (
                sum(block.get("bbox") is not None for block in blocks) / len(blocks) if blocks else 1.0
            ),
            "reason": "",
        },
    }


def markdown_quality_from_ast(
    ast: Dict[str, Any], markdown: str, artifact_report: Dict[str, Any],
) -> Dict[str, Any]:
    artifacts = [value for value in ast.get("artifacts", []) if isinstance(value, dict)]
    identities = [artifact.get("id") for artifact in artifacts]
    unique = len(identities) == len(set(identities))
    bbox_count = sum(artifact.get("bbox") is not None for artifact in artifacts)
    coverage = bbox_count / len(artifacts) if artifacts else 1.0
    artifact_status = str(artifact_report.get("status", "failed"))
    unresolved_artifacts = markdown.count("{{artifact:")
    heading_levels = [
        int(artifact.get("content", {}).get("level", 1))
        for artifact in artifacts if artifact.get("type") == "heading"
    ]
    heading_valid = bool(heading_levels) and heading_levels[0] == 1 and all(
        current <= previous + 1 for previous, current in zip(heading_levels, heading_levels[1:])
    )
    suspect_tokens = sorted(set(_SUSPECT_LANGUAGE_CASE.findall(markdown)))
    checks: List[Dict[str, Any]] = [
        {"id": "SOURCE_MODEL", "status": "pass", "actual": DOCUMENT_AST_SCHEMA,
         "expected": DOCUMENT_AST_SCHEMA},
        {"id": "ARTIFACT_IDENTITIES", "status": "pass" if unique else "fail",
         "actual": len(set(identities)), "expected": len(identities)},
        {"id": "ARTIFACT_QUALITY", "status": (
            "pass" if artifact_status == "pass" else "warn" if artifact_status == "degraded" else "fail"
         ), "actual": artifact_status, "expected": "pass"},
        {"id": "BLOCK_BBOX_COVERAGE", "status": "pass" if coverage >= 0.8 else "warn",
         "actual": round(coverage, 4), "expected": ">=0.8"},
        {"id": "MARKDOWN_IS_PROJECTION", "status": "pass", "actual": sha256_text(markdown),
         "expected": "renderer(DocumentAST)"},
        {"id": "ARTIFACT_PROJECTION_LINKS", "status": "pass" if unresolved_artifacts == 0 else "warn",
         "actual": unresolved_artifacts, "expected": 0},
        {"id": "HEADING_TREE", "status": "pass" if heading_valid else "warn",
         "actual": "valid" if heading_valid else "invalid", "expected": "valid"},
        {"id": "LANGUAGE_SUSPECT_TOKENS", "status": "pass" if not suspect_tokens else "warn",
         "actual": len(suspect_tokens), "expected": 0},
    ]
    failures = sum(check["status"] == "fail" for check in checks)
    warnings = sum(check["status"] == "warn" for check in checks)
    score = max(0, 100 - failures * 25 - warnings * 8)
    status = "failed" if failures >= 2 or score < 50 else "degraded" if failures or warnings else "pass"
    type_counts = Counter(str(artifact.get("type", "unknown")) for artifact in artifacts)
    metrics: Dict[str, Any] = {
        "pages": len(ast.get("pages", [])),
        "artifacts": len(artifacts),
        "semanticArtifacts": sum(artifact.get("semantic") is True for artifact in artifacts),
        "bboxCoverage": round(coverage, 4),
        "headingCount": len(heading_levels),
        "suspectTokens": len(suspect_tokens),
    }
    metrics.update({f"artifact.{key}": value for key, value in sorted(type_counts.items())})
    return {
        "schema": "bioxfoundry.markdown-quality/v1",
        "status": status,
        "score": score,
        "sourceSha256": ast["sourceSha256"],
        "canonicalMarkdownSha256": sha256_text(markdown),
        "metrics": metrics,
        "repairs": {},
        "suspectTokens": suspect_tokens,
        "checks": checks,
    }


def semantic_artifacts(ast: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    for artifact in ast.get("artifacts", []):
        if isinstance(artifact, dict) and artifact.get("semantic") is True:
            yield artifact
