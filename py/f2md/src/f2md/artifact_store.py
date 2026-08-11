"""Immutable, output-aware persistence for typed DocumentAST artifacts."""

from __future__ import annotations

import csv
import hashlib
import importlib
import json
import mimetypes
import os
import re
import shutil
from dataclasses import replace
from io import StringIO
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from .diagram_graph import (
    diagram_graph_metrics,
    render_diagram_dsl,
    render_diagram_mermaid,
    render_diagram_svg,
)
from .document_ast import (
    ARTIFACT_MANIFEST_SCHEMA,
    artifact_quality,
    canonical_json,
    markdown_quality_from_ast,
    render_artifact_dsl,
    render_artifact_quality_dsl,
    render_artifact_tree_dsl,
    render_markdown,
    render_table_artifact,
    sha256_text,
    structure_from_ast,
)
from .types import ConvertedDocument

_CODE_EXTENSIONS = {
    "bash": "sh", "python": "py", "xml": "xml", "json": "json", "yaml": "yaml",
    "systemd": "service", "openscad": "scad", "text": "txt",
}


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")


def _write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value.rstrip() + "\n", encoding="utf-8")


def _relative(path: Path, markdown_path: Path) -> str:
    return os.path.relpath(path, markdown_path.parent).replace(os.sep, "/")


def _prepare_root(markdown_path: str) -> Path:
    root = Path(markdown_path[:-3] + ".artifacts" if markdown_path.endswith(".md") else markdown_path + ".artifacts")
    # This exact derived directory is wholly generator-owned. Refuse symlinks and broad paths
    # before removing stale content-addressed artifacts from a prior projection.
    if root.name == ".artifacts":
        raise ValueError(f"ARTIFACT_STORE_INVALID:{root}")
    if root.is_symlink():
        raise ValueError(f"ARTIFACT_STORE_SYMLINK:{root}")
    if root.exists():
        if not root.is_dir() or not root.name.endswith(".artifacts"):
            raise ValueError(f"ARTIFACT_STORE_INVALID:{root}")
        shutil.rmtree(root)
    root.mkdir(parents=True)
    return root


def _visual_payload(pdf: Any, artifact: Dict[str, Any]) -> Optional[Tuple[bytes, str, str]]:
    content = artifact.get("content", {})
    xref = int(content.get("xref", 0) or 0) if isinstance(content, dict) else 0
    if xref > 0:
        try:
            extracted = pdf.extract_image(xref)
            payload = bytes(extracted.get("image", b""))
            extension = re.sub(r"[^a-z0-9]", "", str(extracted.get("ext", "png")).casefold()) or "png"
            if payload:
                return payload, extension, mimetypes.types_map.get("." + extension, "image/" + extension)
        except Exception:  # noqa: BLE001 - clipped raster fallback below
            pass
    bbox = artifact.get("bbox")
    pages = artifact.get("pages", [])
    if not isinstance(bbox, list) or len(bbox) != 4 or not pages:
        return None
    try:
        pymupdf = importlib.import_module("pymupdf")
        page = pdf[int(pages[0]) - 1]
        payload = page.get_pixmap(
            matrix=pymupdf.Matrix(2, 2), clip=pymupdf.Rect(bbox), alpha=False,
        ).tobytes("png")
        return payload, "png", "image/png"
    except Exception:  # noqa: BLE001
        return None


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _table_payload(root: Path, artifact: Dict[str, Any]) -> Tuple[Path, Path, Path]:
    folder = root / "tables" / artifact["id"]
    content = artifact["content"]
    table_json = {
        "schema": "f2md.table/v1",
        "id": artifact["id"],
        "urn": artifact["urn"],
        "pages": artifact["pages"],
        "columns": content.get("columns", 0),
        "rows": content.get("rows", 0),
        "headerRows": content.get("headerRows", 0),
        "cells": content.get("cells", []),
        "grid": content.get("grid", []),
    }
    json_path = folder / "table.json"
    _write_json(json_path, table_json)
    csv_buffer = StringIO()
    writer = csv.writer(csv_buffer, lineterminator="\n")
    writer.writerows(content.get("grid", []))
    csv_path = folder / "table.csv"
    _write_text(csv_path, csv_buffer.getvalue())
    preview = folder / "table.md"
    _write_text(preview, render_table_artifact(artifact))
    return json_path, preview, csv_path


def materialize_artifact_store(
    ast: Dict[str, Any],
    source_path: str,
    markdown_path: str,
    document_ast_path: str,
) -> Dict[str, Any]:
    """Persist typed sidecars and original visual crops, returning their immutable manifest."""
    root = _prepare_root(markdown_path)
    markdown = Path(markdown_path)
    visual_types = {"figure", "diagram", "chart"}
    needs_pdf = any(
        isinstance(artifact, dict)
        and artifact.get("type") in visual_types
        for artifact in ast.get("artifacts", [])
    )
    pdf = None
    if needs_pdf:
        try:
            pymupdf = importlib.import_module("pymupdf")
            pdf = pymupdf.open(source_path)
        except Exception:  # noqa: BLE001 - manifest stays explicit about missing originals
            pdf = None
    entries = []
    try:
        for artifact in ast.get("artifacts", []):
            if not isinstance(artifact, dict):
                continue
            artifact_type = str(artifact.get("type", "unknown"))
            content = artifact.get("content", {})
            content_uri: Optional[str] = None
            preview_uri: Optional[str] = None
            original_uri: Optional[str] = None
            original_hash: Optional[str] = None
            content_file_hash: Optional[str] = None
            preview_hash: Optional[str] = None
            additional_files = []
            if artifact_type == "table":
                content_path, preview_path, csv_path = _table_payload(root, artifact)
                content_uri, preview_uri = _relative(content_path, markdown), _relative(preview_path, markdown)
                content_file_hash, preview_hash = _file_sha256(content_path), _file_sha256(preview_path)
                additional_files.append({
                    "role": "table-csv",
                    "uri": _relative(csv_path, markdown),
                    "sha256": _file_sha256(csv_path),
                    "mediaType": "text/csv",
                })
            elif artifact_type == "code":
                language = str(content.get("language", "text"))
                extension = _CODE_EXTENSIONS.get(language, re.sub(r"[^a-z0-9]", "", language) or "txt")
                source = root / "code" / artifact["id"] / f"source.{extension}"
                _write_text(source, str(content.get("text", "")))
                content_uri = preview_uri = _relative(source, markdown)
                content_file_hash = preview_hash = _file_sha256(source)
            elif artifact_type == "diagram":
                folder = root / "diagrams" / artifact["id"]
                source_text = str(content.get("text") or content.get("sourceText") or "")
                graph = content.get("graph")
                descriptor = graph if isinstance(graph, dict) else {
                    "schema": "f2md.diagram/v1",
                    "id": artifact["id"],
                    "urn": artifact["urn"],
                    "type": artifact_type,
                    "subtype": artifact.get("subtype"),
                    "pages": artifact["pages"],
                    "bbox": artifact.get("bbox"),
                    "sourceText": source_text,
                    "graph": None,
                }
                descriptor_path = folder / "graph.json"
                _write_json(descriptor_path, descriptor)
                content_uri = _relative(descriptor_path, markdown)
                content_file_hash = _file_sha256(descriptor_path)
                if artifact.get("subtype") == "ascii-diagram":
                    source = folder / "diagram.txt"
                    _write_text(source, source_text)
                    additional_files.append({
                        "role": "diagram-source-text",
                        "uri": _relative(source, markdown),
                        "sha256": _file_sha256(source),
                        "mediaType": "text/plain",
                    })
                metrics = diagram_graph_metrics(graph, source_text)
                if metrics["valid"] and isinstance(graph, dict):
                    mermaid = folder / "diagram.mmd"
                    svg = folder / "diagram.svg"
                    diagram_dsl = folder / "diagram.dsl"
                    _write_text(mermaid, render_diagram_mermaid(graph, source_text))
                    _write_text(svg, render_diagram_svg(graph, source_text))
                    _write_text(
                        diagram_dsl,
                        render_diagram_dsl(str(artifact["urn"]), graph, source_text),
                    )
                    preview_uri = _relative(svg, markdown)
                    preview_hash = _file_sha256(svg)
                    for role, path, media_type in (
                        ("diagram-mermaid", mermaid, "text/vnd.mermaid"),
                        ("diagram-dsl", diagram_dsl, "text/plain"),
                    ):
                        additional_files.append({
                            "role": role,
                            "uri": _relative(path, markdown),
                            "sha256": _file_sha256(path),
                            "mediaType": media_type,
                        })
                visual = _visual_payload(pdf, artifact) if pdf is not None else None
                if visual is not None:
                    payload, extension, _media_type = visual
                    original = folder / f"original.{extension}"
                    original.parent.mkdir(parents=True, exist_ok=True)
                    original.write_bytes(payload)
                    original_uri = _relative(original, markdown)
                    original_hash = hashlib.sha256(payload).hexdigest()
                    if preview_uri is None:
                        preview_uri = original_uri
                        preview_hash = original_hash
            elif artifact_type in visual_types:
                plural = {"figure": "figures", "diagram": "diagrams", "chart": "charts"}[artifact_type]
                folder = root / plural / artifact["id"]
                descriptor_name = "graph.json" if artifact_type == "diagram" else "chart.json" if artifact_type == "chart" else "figure.json"
                descriptor = {
                    "schema": f"f2md.{artifact_type}/v1",
                    "id": artifact["id"],
                    "urn": artifact["urn"],
                    "type": artifact_type,
                    "subtype": artifact.get("subtype"),
                    "pages": artifact["pages"],
                    "bbox": artifact.get("bbox"),
                    "sourceText": content.get("sourceText", ""),
                    "graph": content.get("graph") if artifact_type == "diagram" else None,
                    "data": content.get("data") if artifact_type == "chart" else None,
                }
                descriptor_path = folder / descriptor_name
                _write_json(descriptor_path, descriptor)
                content_uri = _relative(descriptor_path, markdown)
                content_file_hash = _file_sha256(descriptor_path)
                visual = _visual_payload(pdf, artifact) if pdf is not None else None
                if visual is not None:
                    payload, extension, _media_type = visual
                    original = folder / f"original.{extension}"
                    original.parent.mkdir(parents=True, exist_ok=True)
                    original.write_bytes(payload)
                    original_uri = preview_uri = _relative(original, markdown)
                    original_hash = hashlib.sha256(payload).hexdigest()
                    preview_hash = original_hash
            entries.append({
                "id": artifact["id"],
                "urn": artifact["urn"],
                "type": artifact_type,
                "pages": artifact["pages"],
                "bbox": artifact.get("bbox"),
                "contentSha256": sha256_text(canonical_json(content)),
                "contentUri": content_uri,
                "contentFileSha256": content_file_hash,
                "previewUri": preview_uri,
                "previewSha256": preview_hash,
                "originalUri": original_uri,
                "originalSha256": original_hash,
                "additionalFiles": additional_files,
                "quality": artifact.get("quality", "raw"),
            })
    finally:
        if pdf is not None:
            pdf.close()
    manifest = {
        "schema": ARTIFACT_MANIFEST_SCHEMA,
        "sourceSha256": ast["sourceSha256"],
        "documentAst": _relative(Path(document_ast_path), markdown),
        "artifacts": entries,
    }
    _write_json(root / "manifest.json", manifest)
    return manifest


def artifact_store_root(markdown_path: str) -> str:
    return markdown_path[:-3] + ".artifacts" if markdown_path.endswith(".md") else markdown_path + ".artifacts"


def document_ast_path(markdown_path: str) -> str:
    return markdown_path[:-3] + ".ast.json" if markdown_path.endswith(".md") else markdown_path + ".ast.json"


def project_ast_document(
    document: ConvertedDocument,
    source_path: str,
    markdown_path: str,
) -> ConvertedDocument:
    """Materialize an AST-backed document and recompute every downstream projection."""
    ast = document.metadata.get("documentAst")
    if not isinstance(ast, dict) or ast.get("schema") != "f2md.document-ast/v1":
        return document
    ast_path = document_ast_path(markdown_path)
    _write_json(Path(ast_path), ast)
    manifest = materialize_artifact_store(ast, source_path, markdown_path, ast_path)
    markdown = render_markdown(ast, manifest)
    artifact_report = artifact_quality(ast, manifest)
    structure = structure_from_ast(ast, markdown, manifest)
    quality = markdown_quality_from_ast(ast, markdown, artifact_report)
    root = Path(artifact_store_root(markdown_path))
    artifact_dsl = root / "artifacts.dsl"
    artifact_quality_dsl = root / "artifact-quality.dsl"
    artifact_tree_dsl = root / "artifact-tree.dsl"
    _write_text(artifact_dsl, render_artifact_dsl(ast, manifest))
    _write_text(artifact_quality_dsl, render_artifact_quality_dsl(artifact_report))
    _write_text(artifact_tree_dsl, render_artifact_tree_dsl(ast))
    metadata = dict(document.metadata)
    metadata.update({
        "structure": structure,
        "conversionQuality": quality,
        "artifactQuality": artifact_report,
        "artifactManifest": manifest,
        "ocrAudit": structure["ocr"],
        "documentAstArtifact": os.path.basename(ast_path),
        "artifactManifestArtifact": _relative(root / "manifest.json", Path(markdown_path)),
        "artifactDslArtifact": _relative(artifact_dsl, Path(markdown_path)),
        "artifactQualityArtifact": _relative(artifact_quality_dsl, Path(markdown_path)),
        "artifactTreeDslArtifact": _relative(artifact_tree_dsl, Path(markdown_path)),
    })
    warnings = [value for value in document.warnings if not value.startswith("MARKDOWN_QUALITY:")]
    if quality["status"] != "pass":
        warnings.append(f"MARKDOWN_QUALITY:{quality['status'].upper()}:{quality['score']}")
    return replace(
        document, markdown=markdown, metadata=metadata,
        assets=[
            entry["originalUri"] for entry in manifest["artifacts"]
            if isinstance(entry.get("originalUri"), str)
        ],
        warnings=warnings,
    )
