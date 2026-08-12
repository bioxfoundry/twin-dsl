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
import json
from dataclasses import dataclass, field
from typing import Any, Dict, Iterator, List, Optional, Sequence, Tuple

from .chain import ConverterChain, default_chain
from .assets import materialize_pdf_assets
from .artifact_store import project_ast_document
from .detect import detect_document_kind, is_prose_kind, media_type_for
from .source_coverage import SOURCE_STATES, build_source_coverage, source_record, write_source_coverage
from .translate import TranslationPolicy, TranslationUnavailable, detect_language
from .types import ConversionError, ExternalConverterRequired
from .quality import normalize_document, render_quality_dsl

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
    for path in sorted(paths, key=lambda candidate: os.path.relpath(candidate, root).encode("utf-8")):
        relative = os.path.relpath(path, root).replace(os.sep, "/")
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        with open(path, "rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        digest.update(b"\0")
    return digest.hexdigest()


def _in_generated_artifact_store(root: str, path: str) -> bool:
    return any(
        part.endswith((".assets", ".artifacts"))
        for part in os.path.relpath(path, root).split(os.sep)[:-1]
    )


def _write_version(source: str, root: str, source_paths: Sequence[str]) -> None:
    """Write the generated mirror's deterministic conversion identity."""
    from . import __version__

    # A mirror can share its directory with runtime receipts or reports.  Only Markdown
    # payloads are conversion output, so unrelated operational files cannot alter this version.
    generated_paths = list(walk_files(root))

    # Markdown previews inside the ArtifactStore are sidecars, not mirror documents. Keep them in
    # the output snapshot once via ``asset_paths`` without inflating OUTPUT_FILES or double-hashing.
    markdown_paths = [
        path for path in generated_paths
        if path.endswith(".md") and not _in_generated_artifact_store(root, path)
    ]
    structure_paths = [path for path in generated_paths if path.endswith(".structure.json")]
    quality_paths = [path for path in generated_paths if path.endswith(".quality.mdqldsl")]
    ast_paths = [path for path in generated_paths if path.endswith(".ast.json")]
    asset_paths = [
        path for path in generated_paths if _in_generated_artifact_store(root, path)
    ]
    output_paths = markdown_paths + structure_paths + quality_paths + ast_paths + asset_paths
    lines = [
        "FORMAT=bioxfoundry.conversion-version/v1",
        "ARTIFACT=markdown-mirror",
        "CONVERTER=f2md",
        f"CONVERTER_VERSION={__version__}",
        f"SOURCE_FILES={len(source_paths)}",
        f"SOURCE_SNAPSHOT_SHA256={_tree_snapshot(source, source_paths)}",
        f"OUTPUT_FILES={len(markdown_paths)}",
        f"STRUCTURE_FILES={len(structure_paths)}",
        f"QUALITY_FILES={len(quality_paths)}",
        f"AST_FILES={len(ast_paths)}",
        f"ASSET_FILES={len(asset_paths)}",
        f"OUTPUT_ARTIFACTS={len(output_paths)}",
        f"OUTPUT_SNAPSHOT_SHA256={_tree_snapshot(root, output_paths)}",
        "",
    ]
    with open(os.path.join(root, "VERSION"), "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))


def refresh_version(source: str, root: str) -> Dict[str, int]:
    """Refresh the mirror identity without reconverting its already-reviewed Markdown files."""
    source_paths = list(walk_files(os.path.abspath(source)))
    absolute_root = os.path.abspath(root)
    output_paths = [
        path for path in walk_files(absolute_root)
        if path.endswith(".md") and not _in_generated_artifact_store(absolute_root, path)
    ]
    _write_version(os.path.abspath(source), absolute_root, source_paths)
    return {"sourceFiles": len(source_paths), "outputFiles": len(output_paths)}


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
    by_quality: Dict[str, int] = field(default_factory=dict)
    by_state: Dict[str, int] = field(default_factory=lambda: {state: 0 for state in SOURCE_STATES})
    failures: List[Dict[str, str]] = field(default_factory=list)
    coverage_no_change: bool = False
    source_coverage_json: str = "source-coverage.json"
    source_coverage_dsl: str = "source-coverage.dsl"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "converted": self.converted,
            "stubbed": self.stubbed,
            "skipped": self.skipped,
            "confidential": self.confidential,
            "translated": self.translated,
            "byLanguage": dict(sorted(self.by_language.items(), key=lambda kv: -kv[1])),
            "byConverter": dict(sorted(self.by_converter.items(), key=lambda kv: -kv[1])),
            "byQuality": dict(sorted(self.by_quality.items(), key=lambda kv: -kv[1])),
            "byState": dict(self.by_state),
            "failures": self.failures,
            "coverageNoChange": self.coverage_no_change,
            "sourceCoverageJson": self.source_coverage_json,
            "sourceCoverageDsl": self.source_coverage_dsl,
        }


def _reason_code(reason: str, fallback: str = "CONVERSION_FAILED") -> str:
    token = reason.split(":", 1)[0].upper()
    normalized = re.sub(r"[^A-Z0-9]+", "_", token).strip("_")
    return normalized or fallback


def _artifact_paths(markdown_path: str) -> Tuple[str, str]:
    stem = markdown_path[:-3] if markdown_path.endswith(".md") else markdown_path
    return stem + ".structure.json", stem + ".quality.mdqldsl"


def _write_artifacts(markdown_path: str, structure: Dict[str, Any], quality: Dict[str, Any]) -> Tuple[str, str]:
    structure_path, quality_path = _artifact_paths(markdown_path)
    with open(structure_path, "w", encoding="utf-8") as handle:
        json.dump(structure, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    with open(quality_path, "w", encoding="utf-8") as handle:
        handle.write(render_quality_dsl(quality))
    return structure_path, quality_path


def walk_files(root: str) -> Iterator[str]:
    for directory, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS and not d.startswith("."))
        for name in sorted(filenames):
            if name.startswith("."):
                continue
            yield os.path.join(directory, name)


def selected_files(source: str, manifest_path: str) -> List[str]:
    """Load an exact hash-bound source subset; refuse drift and path escapes."""
    try:
        with open(os.path.abspath(manifest_path), encoding="utf-8") as handle:
            manifest = json.load(handle)
    except (OSError, json.JSONDecodeError) as error:
        raise ConversionError(f"SOURCE_SELECTION_JSON_INVALID:{error}") from error
    if (not isinstance(manifest, dict) or manifest.get("schema") != "bioxfoundry.source-selection/v1"
            or not isinstance(manifest.get("id"), str) or not manifest["id"]
            or not isinstance(manifest.get("entries"), list) or not manifest["entries"]
            or set(manifest) != {"schema", "id", "entries"}):
        raise ConversionError("SOURCE_SELECTION_INVALID")
    root = os.path.realpath(source)
    paths: List[str] = []
    seen: set[str] = set()
    for index, entry in enumerate(manifest["entries"]):
        if not isinstance(entry, dict):
            raise ConversionError(f"SOURCE_SELECTION_ENTRY_INVALID:{index}")
        relative_path, expected = entry.get("path"), entry.get("sha256")
        if (not isinstance(relative_path, str) or not relative_path or os.path.isabs(relative_path)
                or "\\" in relative_path or any(part in ("", ".", "..") for part in relative_path.split("/"))
                or not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected)
                or not isinstance(entry.get("family"), str) or not entry["family"]
                or entry.get("expectedUse") not in {"behavior", "interface", "safety", "telemetry", "geometry", "documentation"}
                or not isinstance(entry.get("reason"), str) or not entry["reason"]
                or set(entry) != {"path", "sha256", "family", "expectedUse", "reason"}):
            raise ConversionError(f"SOURCE_SELECTION_ENTRY_INVALID:{index}")
        if relative_path in seen:
            raise ConversionError(f"SOURCE_SELECTION_PATH_DUPLICATE:{relative_path}")
        seen.add(relative_path)
        candidate = os.path.abspath(os.path.join(root, *relative_path.split("/")))
        if os.path.commonpath((root, candidate)) != root:
            raise ConversionError(f"SOURCE_SELECTION_PATH_UNSAFE:{relative_path}")
        if not os.path.isfile(candidate):
            raise ConversionError(f"SOURCE_SELECTION_SOURCE_MISSING:{relative_path}")
        actual = os.path.realpath(candidate)
        if os.path.commonpath((root, actual)) != root:
            raise ConversionError(f"SOURCE_SELECTION_SYMLINK_ESCAPE:{relative_path}")
        digest = hashlib.sha256()
        with open(actual, "rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected:
            raise ConversionError(f"SOURCE_SELECTION_HASH_MISMATCH:{relative_path}")
        paths.append(actual)
    return sorted(paths, key=lambda path: os.path.relpath(path, root).encode("utf-8"))


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
    relative_prefix: Optional[str] = None,
    manifest_path: Optional[str] = None,
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
    paths = selected_files(src, manifest_path) if manifest_path else list(walk_files(src))
    coverage_records: List[Dict[str, Any]] = []
    for index, path in enumerate(paths, 1):
        relative = os.path.relpath(path, src)
        source_relative = os.path.join(relative_prefix, relative) if relative_prefix else relative
        coverage_path = relative.replace(os.sep, "/")
        kind = detect_document_kind(path)
        if only and kind not in only:
            result.skipped += 1
            coverage_records.append(source_record(
                root=src,
                path=path,
                input_kind=kind,
                media_type=media_type_for(path),
                state="excluded-by-policy",
                reason_code="KIND_NOT_SELECTED",
            ))
            continue
        os.makedirs(os.path.dirname(os.path.join(out, relative)), exist_ok=True)

        base_fields: Dict[str, Any] = {
            # Absolute, so a Markdown file still points at its origin after being moved or
            # published somewhere else. The tree-relative form is kept alongside it because that
            # is what mirrors the output layout.
            "source": os.path.abspath(path),
            "sourceRelative": source_relative.replace(os.sep, "/"),
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
            artifacts = normalize_document(
                body, path, normalize=False, backend_warnings=[f"CONVERSION_FAILED:{reason}"],
            )
            artifacts.quality["status"] = "failed"
            artifacts.quality["score"] = 0
            artifacts.quality["checks"].append({
                "id": "CONVERSION", "status": "fail", "actual": reason, "expected": "converted",
            })
            fields = {
                **base_fields, "converter": "none", "converted": False, "error": reason,
                "qualityStatus": "failed", "qualityScore": 0,
            }
            # A stub has no text to match against, so it is never classified as confidential.
            target = os.path.join(out, relative + ".md")
            structure_path, quality_path = _write_artifacts(target, artifacts.structure, artifacts.quality)
            fields["structureArtifact"] = os.path.basename(structure_path)
            fields["qualityArtifact"] = os.path.basename(quality_path)
            with open(target, "w", encoding="utf-8") as handle:
                handle.write(front_matter(fields) + body)
            result.stubbed += 1
            result.by_quality["failed"] = result.by_quality.get("failed", 0) + 1
            result.by_converter["none"] = result.by_converter.get("none", 0) + 1
            result.failures.append({"source": relative, "error": reason[:200]})
            state = "unsupported" if isinstance(error, ExternalConverterRequired) else "failed"
            coverage_records.append(source_record(
                root=src,
                path=path,
                input_kind=kind,
                media_type=media_type_for(path),
                state=state,
                reason_code="EXTERNAL_CONVERTER_REQUIRED" if state == "unsupported" else _reason_code(reason),
                markdown_path=coverage_path + ".md",
            ))
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
        document = project_ast_document(document, path, target)
        if "documentAst" not in document.metadata:
            # Compatibility path for non-layout backends. It may repair a picture transcription,
            # but it never masquerades as the canonical AST-first engine.
            document = materialize_pdf_assets(document, path, target)
        fields = {
            **base_fields,
            "confidential": secret,
            "language": language or "unknown",
            "converter": document.converter,
            "converterVersion": document.version,
            "backendType": document.backend_type,
            "ocr": document.ocr,
            "ocrRequested": bool(document.metadata.get("ocrAudit", {}).get("ocrRequested", False)),
            "ocrActuallyUsed": bool(document.metadata.get("ocrAudit", {}).get("ocrActuallyUsed", document.ocr)),
            "ocrEngine": document.metadata.get("ocrAudit", {}).get("ocrEngine", "unknown"),
            "ocrVersion": document.metadata.get("ocrAudit", {}).get("ocrVersion", "unknown"),
            "ocrLanguages": document.metadata.get("ocrAudit", {}).get("ocrLanguages", []),
            "ocrPages": document.metadata.get("ocrAudit", {}).get("ocrPages", []),
            "ocrRegionCount": len(document.metadata.get("ocrAudit", {}).get("ocrRegions", [])),
            "ocrConfidence": document.metadata.get("ocrAudit", {}).get("ocrConfidence") or "unknown",
            "fallbackDepth": document.fallback_depth,
            "durationMs": document.duration_ms,
            "size": document.metadata.get("size", 0),
            "mtime": document.metadata.get("mtime", ""),
            "extractedChars": document.metadata.get("extractedChars", len(document.markdown)),
            "converted": True,
            "warnings": list(document.warnings),
        }
        structure = document.metadata.get("structure", {})
        quality = document.metadata.get("conversionQuality", {})
        quality_status = str(quality.get("status", "failed"))
        quality_score = int(quality.get("score", 0))
        structure_path, quality_path = _artifact_paths(target)
        fields.update({
            "qualityStatus": quality_status,
            "qualityScore": quality_score,
            "structureArtifact": os.path.basename(structure_path),
            "qualityArtifact": os.path.basename(quality_path),
        })
        if isinstance(document.metadata.get("documentAstArtifact"), str):
            fields.update({
                "sourceModel": "f2md.document-ast/v1",
                "documentAstArtifact": document.metadata["documentAstArtifact"],
                "artifactManifest": document.metadata["artifactManifestArtifact"],
                "artifactDsl": document.metadata["artifactDslArtifact"],
                "artifactQualityArtifact": document.metadata["artifactQualityArtifact"],
                "artifactTreeDsl": document.metadata["artifactTreeDslArtifact"],
            })
        with open(target, "w", encoding="utf-8") as handle:
            handle.write(front_matter(fields) + document.markdown.rstrip() + "\n")
        _write_artifacts(target, structure, quality)
        result.converted += 1
        result.by_quality[quality_status] = result.by_quality.get(quality_status, 0) + 1
        if secret:
            result.confidential += 1
        result.by_converter[document.converter] = result.by_converter.get(document.converter, 0) + 1
        state = "binary-provenance" if document.converter == "stl-metadata" else "converted"
        coverage_records.append(source_record(
            root=src,
            path=path,
            input_kind=kind,
            media_type=media_type_for(path),
            state=state,
            reason_code="BINARY_PROVENANCE" if state == "binary-provenance" else "CONVERTED",
            markdown_path=os.path.relpath(target, out).replace(os.sep, "/"),
            converter=document.converter,
            converter_version=document.version,
        ))

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
            if translation.repairs:
                translated_fields["translationRepairs"] = list(translation.repairs)
            # Translation is a derived Markdown document, not a faithful layout projection of the
            # source PDF.  It receives its own semantic structure below and must not inherit the
            # original DocumentAST/ArtifactStore provenance by association.
            for ast_field in (
                "sourceModel", "documentAstArtifact", "artifactManifest", "artifactDsl",
                "artifactQualityArtifact", "artifactTreeDsl",
            ):
                translated_fields.pop(ast_field, None)
            # The structure hash describes the exact materialized Markdown body, including its
            # conventional final newline.  Hashing the pre-write, newline-less translation made
            # every translated structure fail the intent compiler's byte contract.
            translated_body = translation.text.rstrip() + "\n"
            translated_artifacts = normalize_document(translated_body, path, normalize=False)
            translated_structure_path, translated_quality_path = _write_artifacts(
                translated_path, translated_artifacts.structure, translated_artifacts.quality,
            )
            translated_fields.update({
                "qualityStatus": translated_artifacts.quality["status"],
                "qualityScore": translated_artifacts.quality["score"],
                "structureArtifact": os.path.basename(translated_structure_path),
                "qualityArtifact": os.path.basename(translated_quality_path),
                "warnings": [
                    warning for warning in translated_fields.get("warnings", [])
                    if not str(warning).startswith("MARKDOWN_QUALITY:")
                ] + [f"TRANSLATION_REPAIR:{code}" for code in translation.repairs] + ([
                    "MARKDOWN_QUALITY:"
                    f"{translated_artifacts.quality['status'].upper()}:"
                    f"{translated_artifacts.quality['score']}"
                ] if translated_artifacts.quality["status"] != "pass" else []),
            })
            with open(translated_path, "w", encoding="utf-8") as handle:
                handle.write(front_matter(translated_fields) + translated_artifacts.markdown)
            result.translated += 1
        if on_progress:
            on_progress(index, len(paths), relative, document.converter)
    coverage = build_source_coverage(_tree_snapshot(src, paths), coverage_records)
    result.by_state = dict(coverage["summary"]["byState"])
    result.coverage_no_change = write_source_coverage(out, coverage)
    _write_version(src, out, paths)
    return result
