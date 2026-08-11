"""Quality audit for converted Markdown trees and generated Digital Twin artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from .detect import detect_document_kind
from .document_ast import canonical_json


@dataclass
class Finding:
    severity: str
    code: str
    path: str
    message: str
    hint: str = ""

    def as_dict(self) -> Dict[str, str]:
        return {"severity": self.severity, "code": self.code, "path": self.path,
                "message": self.message, "hint": self.hint}


@dataclass
class AuditReport:
    findings: List[Finding] = field(default_factory=list)
    metrics: Dict[str, Any] = field(default_factory=dict)

    def add(self, severity: str, code: str, path: str, message: str, hint: str = "") -> None:
        self.findings.append(Finding(severity, code, path, message, hint))

    @property
    def errors(self) -> int:
        return sum(f.severity == "ERROR" for f in self.findings)

    @property
    def warnings(self) -> int:
        return sum(f.severity == "WARNING" for f in self.findings)

    def as_dict(self) -> Dict[str, Any]:
        return {"schema": "subactor.audit-report/v1", "ok": self.errors == 0,
                "errors": self.errors, "warnings": self.warnings,
                "metrics": self.metrics, "findings": [f.as_dict() for f in self.findings]}


def _front_matter(text: str) -> Dict[str, str]:
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end < 0:
        return {}
    out: Dict[str, str] = {}
    for line in text[4:end].splitlines():
        match = re.match(r"^([A-Za-z][A-Za-z0-9_]*):\s*\"?(.*?)\"?$", line)
        if match:
            out[match.group(1)] = match.group(2)
    return out


def _markdown_body(text: str) -> str:
    if not text.startswith("---\n"):
        return text
    end = text.find("\n---\n", 4)
    if end < 0:
        return text
    body = text[end + len("\n---\n"):]
    return body[1:] if body.startswith("\n") else body


def _md_target(out: Path, relative: Path, confidential: bool, language: Optional[str]) -> Path:
    marker = ".secret" if confidential else ""
    suffix = f".{language}" if language and language != "en" else ""
    return out / f"{relative}{marker}{suffix}.md"


def _audit_structure_assets(
    structure: Dict[str, Any],
    markdown_path: Path,
    output_root: Path,
    report: AuditReport,
    audited_assets: set[Path],
) -> None:
    blocks = structure.get("blocks", [])
    if not isinstance(blocks, list):
        raise ValueError("DOCUMENT_STRUCTURE_BLOCKS")
    for block in blocks:
        if not isinstance(block, dict) or not isinstance(block.get("asset"), str):
            continue
        relative_asset = Path(block["asset"])
        if relative_asset.is_absolute() or ".." in relative_asset.parts:
            report.add(
                "ERROR", "DOCUMENT_ASSET_PATH_INVALID", str(markdown_path),
                f"Asset path escapes the mirror: {block['asset']}",
                "Keep extracted figures below the Markdown mirror.",
            )
            continue
        asset_path = (markdown_path.parent / relative_asset).resolve()
        try:
            asset_path.relative_to(output_root)
        except ValueError:
            report.add(
                "ERROR", "DOCUMENT_ASSET_PATH_INVALID", str(markdown_path),
                f"Asset path escapes the mirror: {block['asset']}",
                "Keep extracted figures below the Markdown mirror.",
            )
            continue
        if not asset_path.is_file():
            report.add(
                "ERROR", "DOCUMENT_ASSET_MISSING", str(asset_path),
                "A structure block points to a missing figure asset.",
                "Regenerate Markdown, structure and assets atomically.",
            )
            continue
        expected_hash = block.get("assetSha256")
        if isinstance(expected_hash, str):
            actual_hash = hashlib.sha256(asset_path.read_bytes()).hexdigest()
            if actual_hash != expected_hash:
                report.add(
                    "ERROR", "DOCUMENT_ASSET_HASH_MISMATCH", str(asset_path),
                    "Figure bytes disagree with document.structure.json.",
                    "Restore or regenerate the content-addressed asset.",
                )
        else:
            report.add(
                "WARNING", "DOCUMENT_ASSET_HASH_MISSING", str(asset_path),
                "Figure provenance has no SHA-256.",
                "Materialize the asset through the canonical Python f2md tree pipeline.",
            )
        if block.get("bbox") is None:
            report.add(
                "WARNING", "DOCUMENT_ASSET_BBOX_MISSING", str(asset_path),
                "Figure provenance has no source bounding box.",
                "Use a layout-aware PDF backend or keep the document DEGRADED.",
            )
        audited_assets.add(asset_path)


def _contract_path(
    value: str, markdown_path: Path, output_root: Path, report: AuditReport, code: str,
) -> Optional[Path]:
    relative = Path(value)
    if relative.is_absolute() or ".." in relative.parts:
        report.add("ERROR", code, str(markdown_path), f"Contract path escapes the mirror: {value}")
        return None
    resolved = (markdown_path.parent / relative).resolve()
    try:
        resolved.relative_to(output_root)
    except ValueError:
        report.add("ERROR", code, str(markdown_path), f"Contract path escapes the mirror: {value}")
        return None
    if not resolved.is_file():
        report.add("ERROR", code, str(resolved), "Referenced AST artifact is missing")
        return None
    return resolved


def _audit_ast_contract(
    source_path: Path,
    markdown_path: Path,
    output_root: Path,
    frontmatter: Dict[str, str],
    structure: Dict[str, Any],
    report: AuditReport,
) -> None:
    if frontmatter.get("sourceModel") != "f2md.document-ast/v1":
        return
    required = {
        "documentAstArtifact": "DOCUMENT_AST_MISSING",
        "artifactManifest": "ARTIFACT_MANIFEST_MISSING",
        "artifactDsl": "ARTIFACT_DSL_MISSING",
        "artifactQualityArtifact": "ARTIFACT_QUALITY_DSL_MISSING",
        "artifactTreeDsl": "ARTIFACT_TREE_DSL_MISSING",
    }
    paths: Dict[str, Path] = {}
    for field_name, code in required.items():
        value = frontmatter.get(field_name, "")
        if not value:
            report.add("ERROR", code, str(markdown_path), f"Front matter field {field_name} is missing")
            continue
        resolved = _contract_path(value, markdown_path, output_root, report, code)
        if resolved is not None:
            paths[field_name] = resolved
    if "documentAstArtifact" not in paths or "artifactManifest" not in paths:
        return
    try:
        ast = json.loads(paths["documentAstArtifact"].read_text(encoding="utf-8"))
        manifest = json.loads(paths["artifactManifest"].read_text(encoding="utf-8"))
        if ast.get("schema") != "f2md.document-ast/v1":
            raise ValueError("DOCUMENT_AST_SCHEMA")
        source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
        if ast.get("sourceSha256") != source_hash or ast.get("source") != str(source_path):
            raise ValueError("DOCUMENT_AST_SOURCE_MISMATCH")
        if ast.get("extractor", {}).get("mode") != "layout-first":
            raise ValueError("DOCUMENT_AST_NOT_LAYOUT_FIRST")
        artifacts = ast.get("artifacts")
        if not isinstance(artifacts, list):
            raise ValueError("DOCUMENT_AST_ARTIFACTS")
        artifact_ids = [item.get("id") for item in artifacts if isinstance(item, dict)]
        if len(artifact_ids) != len(artifacts) or len(artifact_ids) != len(set(artifact_ids)):
            raise ValueError("DOCUMENT_AST_ARTIFACT_IDENTITIES")
        ast_hash = hashlib.sha256(canonical_json(ast).encode("utf-8")).hexdigest()
        if structure.get("sourceModel") != ast["schema"] or structure.get("documentAstSha256") != ast_hash:
            raise ValueError("DOCUMENT_AST_STRUCTURE_MISMATCH")
        if manifest.get("schema") != "f2md.artifact-manifest/v1":
            raise ValueError("ARTIFACT_MANIFEST_SCHEMA")
        if manifest.get("sourceSha256") != source_hash:
            raise ValueError("ARTIFACT_MANIFEST_SOURCE_MISMATCH")
        if (markdown_path.parent / str(manifest.get("documentAst", ""))).resolve() != paths[
            "documentAstArtifact"
        ]:
            raise ValueError("ARTIFACT_MANIFEST_AST_MISMATCH")
        entries = manifest.get("artifacts")
        if (
            not isinstance(entries, list)
            or not all(isinstance(item, dict) for item in entries)
            or {item.get("id") for item in entries} != set(artifact_ids)
        ):
            raise ValueError("ARTIFACT_MANIFEST_COVERAGE")
        by_id = {item["id"]: item for item in artifacts}
        for entry in entries:
            expected = hashlib.sha256(canonical_json(by_id[entry["id"]]["content"]).encode("utf-8")).hexdigest()
            if entry.get("contentSha256") != expected:
                raise ValueError(f"ARTIFACT_CONTENT_HASH_MISMATCH:{entry['id']}")
            file_fields = (
                ("contentUri", "contentFileSha256"),
                ("previewUri", "previewSha256"),
                ("originalUri", "originalSha256"),
            )
            for uri_field, hash_field in file_fields:
                uri = entry.get(uri_field)
                expected_file_hash = entry.get(hash_field)
                if isinstance(uri, str):
                    resolved = _contract_path(
                        uri, markdown_path, output_root, report, "ARTIFACT_CONTENT_MISSING",
                    )
                    if resolved is None:
                        raise ValueError(f"ARTIFACT_CONTENT_PATH:{entry['id']}:{uri_field}")
                    if not isinstance(expected_file_hash, str):
                        raise ValueError(f"ARTIFACT_FILE_HASH_MISSING:{entry['id']}:{hash_field}")
                    actual_file_hash = hashlib.sha256(resolved.read_bytes()).hexdigest()
                    if actual_file_hash != expected_file_hash:
                        raise ValueError(f"ARTIFACT_FILE_HASH_MISMATCH:{entry['id']}:{uri_field}")
                elif expected_file_hash is not None:
                    raise ValueError(f"ARTIFACT_FILE_HASH_WITHOUT_URI:{entry['id']}:{hash_field}")
            additional_files = entry.get("additionalFiles")
            if not isinstance(additional_files, list) or not all(
                isinstance(item, dict) for item in additional_files
            ):
                raise ValueError(f"ARTIFACT_ADDITIONAL_FILES_INVALID:{entry['id']}")
            for additional in additional_files:
                uri = additional.get("uri")
                expected_file_hash = additional.get("sha256")
                if not isinstance(uri, str) or not isinstance(expected_file_hash, str):
                    raise ValueError(f"ARTIFACT_ADDITIONAL_FILE_INVALID:{entry['id']}")
                resolved = _contract_path(
                    uri, markdown_path, output_root, report, "ARTIFACT_CONTENT_MISSING",
                )
                if resolved is None:
                    raise ValueError(f"ARTIFACT_ADDITIONAL_FILE_PATH:{entry['id']}:{uri}")
                if hashlib.sha256(resolved.read_bytes()).hexdigest() != expected_file_hash:
                    raise ValueError(f"ARTIFACT_ADDITIONAL_FILE_HASH_MISMATCH:{entry['id']}:{uri}")
        report.metrics["astFiles"] += 1
        report.metrics["artifactManifests"] += 1
        report.metrics["typedArtifacts"] += len(artifacts)
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        report.add(
            "ERROR", "DOCUMENT_AST_CONTRACT_INVALID", str(markdown_path), str(error),
            "Regenerate DocumentAST, its manifest and every projection atomically.",
        )
    artifact_dsl = paths.get("artifactDsl")
    if artifact_dsl is not None:
        value = artifact_dsl.read_text(encoding="utf-8", errors="replace")
        if "DOCUMENT_ARTIFACTS " not in value or "END_DOCUMENT_ARTIFACTS" not in value:
            report.add("ERROR", "ARTIFACT_DSL_INVALID", str(artifact_dsl), "ArtifactDSL is incomplete")
    quality_dsl = paths.get("artifactQualityArtifact")
    if quality_dsl is not None:
        value = quality_dsl.read_text(encoding="utf-8", errors="replace")
        if "ARTIFACT_QUALITY " not in value or "END_ARTIFACT_QUALITY" not in value:
            report.add(
                "ERROR", "ARTIFACT_QUALITY_DSL_INVALID", str(quality_dsl),
                "ArtifactQualityDSL is incomplete",
            )
    tree_dsl = paths.get("artifactTreeDsl")
    if tree_dsl is not None:
        value = tree_dsl.read_text(encoding="utf-8", errors="replace")
        if not value.startswith("TREE ") or "\n  NODE " not in value:
            report.add("ERROR", "ARTIFACT_TREE_DSL_INVALID", str(tree_dsl), "Artifact treeDSL is incomplete")


def audit_markdown_tree(source: str | Path, output: str | Path, secret_pattern: str = "") -> AuditReport:
    src, out = Path(source).resolve(), Path(output).resolve()
    report = AuditReport(metrics={"sourceFiles": 0, "markdownFiles": 0, "converted": 0,
                                   "translated": 0, "missing": 0, "byConverter": {},
                                   "byQuality": {}, "structureFiles": 0, "qualityFiles": 0,
                                   "astFiles": 0, "artifactManifests": 0, "typedArtifacts": 0,
                                   "assetFiles": 0, "headings": 0, "tables": 0})
    audited_assets: set[Path] = set()
    pattern = re.compile(secret_pattern, re.IGNORECASE) if secret_pattern else None
    for path in sorted(p for p in src.rglob("*") if p.is_file() and ".git" not in p.parts):
        report.metrics["sourceFiles"] += 1
        rel = path.relative_to(src)
        kind = detect_document_kind(str(path))
        if kind == "":
            continue
        if pattern:
            try:
                sample = path.open("rb").read(200_000).decode("utf-8", errors="ignore")
            except OSError:
                sample = ""
            expected_secret = bool(pattern.search(sample))
        else:
            expected_secret = False
        # For prose documents, a missing language detector is a warning; LaTeX is expected to be
        # translated when its source language is not English.
        candidates = [p for p in out.glob(f"{rel}*.md")]
        if not candidates:
            report.metrics["missing"] += 1
            report.add("ERROR", "OUTPUT_MISSING", str(rel), "No Markdown output exists", "Run f2md --tree for this source tree.")
            continue
        for target in candidates:
            report.metrics["markdownFiles"] += 1
            try:
                text = target.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                report.add("ERROR", "OUTPUT_NOT_UTF8", str(target), "Generated output is not UTF-8", "Rewrite the file through f2md.")
                continue
            fm = _front_matter(text)
            body = _markdown_body(text)
            if not fm:
                report.add("ERROR", "FRONT_MATTER_MISSING", str(target), "Provenance envelope is missing", "Every generated Markdown file must have front matter.")
                continue
            if fm.get("source") != str(path):
                report.add("ERROR", "SOURCE_MISMATCH", str(target), "Front matter source does not match input", "Regenerate the tree from the canonical source path.")
            converter = fm.get("converter", "")
            report.metrics["byConverter"][converter] = report.metrics["byConverter"].get(converter, 0) + 1
            quality_status = fm.get("qualityStatus", "missing").casefold()
            report.metrics["byQuality"][quality_status] = report.metrics["byQuality"].get(quality_status, 0) + 1
            report.metrics["converted"] += fm.get("converted") == "true"
            report.metrics["translated"] += fm.get("translatedFrom") == "lt" or fm.get("translatedFrom") == "unknown"
            if kind == ".tex" and converter != "pandoc":
                report.add("ERROR", "LATEX_NOT_STRUCTURED", str(target), f"LaTeX used {converter or 'unknown'} instead of Pandoc", "Install Pandoc and rerun conversion.")
            expected_for_output = expected_secret or ".secret" in target.name
            if fm.get("confidential") != ("true" if expected_for_output else "false"):
                report.add("WARNING", "CONFIDENTIALITY_MISMATCH", str(target), "Confidentiality marker differs from configured pattern", "Use the same --secret-pattern on every run.")
            if body.count("```") % 2:
                report.add("ERROR", "UNCLOSED_CODE_FENCE", str(target), "Markdown contains an unclosed code fence", "Protect fences during translation and regenerate.")
            if quality_status == "failed":
                report.add("ERROR", "MARKDOWN_QUALITY_FAILED", str(target), "Canonical Markdown failed its quality contract", "Keep it outside SSOT/current and inspect the quality DSL.")
            elif quality_status == "degraded":
                report.add("WARNING", "MARKDOWN_QUALITY_DEGRADED", str(target), "Canonical Markdown is a repair candidate, not SSOT/current", "Inspect quality checks or use a stronger block backend.")
            elif quality_status != "pass":
                report.add("ERROR", "MARKDOWN_QUALITY_NOT_RUN", str(target), "No explicit Markdown quality status exists", "Regenerate with f2md-quality-v1.")
            structure_name = fm.get("structureArtifact", "")
            quality_name = fm.get("qualityArtifact", "")
            sidecar_stem = str(target)[:-3] if str(target).endswith(".md") else str(target)
            expected_structure_path = Path(sidecar_stem + ".structure.json")
            expected_quality_path = Path(sidecar_stem + ".quality.mdqldsl")
            if structure_name and structure_name != expected_structure_path.name:
                report.add("ERROR", "DOCUMENT_STRUCTURE_PATH_INVALID", str(target), "Structure sidecar must stay beside its Markdown", "Regenerate the mirror; external and parent paths are forbidden.")
            if quality_name and quality_name != expected_quality_path.name:
                report.add("ERROR", "MARKDOWN_QUALITY_PATH_INVALID", str(target), "Quality sidecar must stay beside its Markdown", "Regenerate the mirror; external and parent paths are forbidden.")
            structure_path = expected_structure_path
            quality_path = expected_quality_path
            if not structure_path.is_file():
                report.add("ERROR", "DOCUMENT_STRUCTURE_MISSING", str(target), "document.structure.json sidecar is missing", "Regenerate the Markdown mirror.")
            else:
                report.metrics["structureFiles"] += 1
                try:
                    structure = json.loads(structure_path.read_text(encoding="utf-8"))
                    body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
                    if structure.get("schema") != "bioxfoundry.document-structure/v1":
                        raise ValueError("DOCUMENT_STRUCTURE_SCHEMA")
                    if structure.get("canonicalMarkdownSha256") != body_hash:
                        raise ValueError("DOCUMENT_STRUCTURE_MARKDOWN_MISMATCH")
                    _audit_structure_assets(structure, target, out, report, audited_assets)
                    _audit_ast_contract(path, target, out, fm, structure, report)
                except (OSError, json.JSONDecodeError, ValueError) as error:
                    report.add("ERROR", "DOCUMENT_STRUCTURE_INVALID", str(structure_path), str(error), "Regenerate both Markdown and sidecars atomically.")
            if not quality_path.is_file():
                report.add("ERROR", "MARKDOWN_QUALITY_DSL_MISSING", str(target), "MarkdownQualityDSL sidecar is missing", "Regenerate the Markdown mirror.")
            else:
                report.metrics["qualityFiles"] += 1
                quality_dsl = quality_path.read_text(encoding="utf-8", errors="replace")
                if f"STATUS {quality_status.upper()}" not in quality_dsl or "END_MARKDOWN_QUALITY" not in quality_dsl:
                    report.add("ERROR", "MARKDOWN_QUALITY_DSL_MISMATCH", str(quality_path), "Quality DSL disagrees with front matter", "Regenerate both artifacts atomically.")
            ocr_legacy = fm.get("ocr") == "true"
            ocr_actual = fm.get("ocrActuallyUsed") == "true"
            if ocr_legacy != ocr_actual:
                report.add("ERROR", "OCR_AUDIT_CONTRADICTION", str(target), "ocr and ocrActuallyUsed disagree", "Regenerate provenance from explicit backend evidence.")
            if ocr_actual and fm.get("ocrEngine", "none") == "none":
                report.add("ERROR", "OCR_ENGINE_MISSING", str(target), "OCR was used but its engine is not recorded", "Record engine, version, pages and regions.")
            headings = len(re.findall(r"(?m)^#{1,6}\s+", body))
            report.metrics["headings"] += headings
            report.metrics["tables"] += bool(re.search(r"(?m)^\|.*\|$", body))
            if kind == ".tex" and headings < 3:
                report.add("WARNING", "LOW_STRUCTURE", str(target), "Converted LaTeX contains very few headings", "Check whether Pandoc or a fallback backend was used.")
    report.metrics["assetFiles"] = len(audited_assets)
    return report


def audit_twin_artifacts(root: str | Path, report: Optional[AuditReport] = None) -> AuditReport:
    report = report or AuditReport()
    base = Path(root).resolve()
    json_files = list(base.rglob("*.json")) if base.exists() else []
    report.metrics.setdefault("twinJsonFiles", len(json_files))
    twin = next((p for p in json_files if p.name == "twin.json"), None)
    scene = next((p for p in json_files if p.name == "scene.json"), None)
    usda = next((p for p in base.rglob("scene.usda")), None)
    if not twin:
        report.add("ERROR", "TWIN_MISSING", str(base), "Generated twin.json was not found", "Run a validated project iteration first.")
    else:
        try:
            value = json.loads(twin.read_text(encoding="utf-8"))
            components = value.get("components", [])
            report.metrics["twinComponents"] = len(components)
            if value.get("schema") != "subactor.twin/v1" or not components:
                report.add("ERROR", "TWIN_INVALID", str(twin), "Twin schema or components are invalid", "Run validateTwin and inspect generation-audit.json.")
            grades = [str(c.get("properties", {}).get("geometryEvidence", "placeholder"))
                      for c in components if isinstance(c, dict)]
            report.metrics["geometryEvidence"] = {grade: grades.count(grade) for grade in sorted(set(grades))}
            missing_geometry = sum(grade == "placeholder" for grade in grades)
            report.metrics["componentsWithoutGeometry"] = missing_geometry
            if missing_geometry:
                report.add("WARNING", "GEOMETRY_UNGROUNDED", str(twin), f"{missing_geometry} components have only placeholder geometry", "Add CAD/IFC/floor-plan evidence and run physical-intake.")
        except (OSError, json.JSONDecodeError) as error:
            report.add("ERROR", "TWIN_JSON_INVALID", str(twin), str(error), "Regenerate the candidate artifact.")
    if not scene:
        report.add("ERROR", "SCENE_MISSING", str(base), "Generated scene.json was not found", "Run scene-render/project-iterate.")
    else:
        try:
            value = json.loads(scene.read_text(encoding="utf-8"))
            bindings = value.get("bindings", [])
            report.metrics["sceneBindings"] = len(bindings)
            if value.get("schema") != "subactor.scene/v1" or not bindings:
                report.add("ERROR", "SCENE_INVALID", str(scene), "Scene schema or bindings are invalid", "Validate scene against subactor.scene/v1.")
        except (OSError, json.JSONDecodeError) as error:
            report.add("ERROR", "SCENE_JSON_INVALID", str(scene), str(error), "Regenerate the candidate artifact.")
    if not usda or usda.stat().st_size < 100:
        report.add("ERROR", "USD_MISSING_OR_EMPTY", str(base), "scene.usda is missing or empty", "Run scene-render after scene validation.")
    return report


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="f2md-audit")
    parser.add_argument("source")
    parser.add_argument("output")
    parser.add_argument("--twin", default=None, help="generated Digital Twin runtime directory")
    parser.add_argument("--secret-pattern", default="")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    report = audit_markdown_tree(args.source, args.output, args.secret_pattern)
    if args.twin:
        audit_twin_artifacts(args.twin, report)
    payload = report.as_dict()
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        print(f"f2md-audit: {'OK' if report.errors == 0 else 'ERROR'} errors={report.errors} warnings={report.warnings}")
        print(json.dumps(payload["metrics"], ensure_ascii=False, indent=2))
        for finding in report.findings:
            print(f"{finding.severity} {finding.code} {finding.path}: {finding.message} | {finding.hint}")
    return 0 if report.errors == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
