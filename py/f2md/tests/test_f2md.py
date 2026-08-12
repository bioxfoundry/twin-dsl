from __future__ import annotations

import json
import hashlib
import os
import subprocess
import sys
import threading
import shutil
import struct
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

from f2md import (
    __version__,
    BACKEND_TYPES,
    ConversionError,
    ConverterChain,
    ConvertedDocument,
    DoclingHttpConverter,
    ExternalConverterRequired,
    LocalToolConverter,
    MarkItDownConverter,
    PyMuPDFConverter,
    ScadSourceConverter,
    STLMetadataConverter,
    TextConverter,
    convert,
    convert_to_markdown,
    detect_document_kind,
    media_type_for,
)
from f2md.cli import main
from f2md.audit import audit_markdown_tree
from f2md.artifact_store import materialize_artifact_store
from f2md.intent_compile import MAX_INTENT_TEXT, compile_tree, refresh_contract, refresh_output_identity
from f2md.quality import PageMarkdown, normalize_document
from f2md.tree import convert_tree
from f2md.document_ast import (
    artifact_quality,
    markdown_quality_from_ast,
    render_markdown,
    render_table_artifact,
)
from f2md.diagram_graph import (
    build_ascii_diagram_graph,
    diagram_graph_metrics,
    render_diagram_dsl,
    render_diagram_mermaid,
    render_diagram_svg,
)
from f2md.pdf_layout import extract_pdf_ast


F2MD_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = Path(__file__).resolve().parents[3]


def test_f2md_version_matches_repository_and_distribution_metadata() -> None:
    metadata = (F2MD_ROOT / "pyproject.toml").read_text(encoding="utf-8")
    declared = next(
        line.split("=", 1)[1].strip().strip('"')
        for line in metadata.splitlines()
        if line.startswith("version = ")
    )
    assert declared == __version__
    assert declared == (REPOSITORY_ROOT / "VERSION").read_text(encoding="utf-8").strip()


# --------------------------------------------------------------------------- detection
@pytest.mark.parametrize(
    "path,expected",
    [
        ("a/b/report.pdf", ".pdf"),
        # Content-addressed imports lose their real suffix; detection must still work.
        ("imports/report.pdf-9f2c8ad4", ".pdf"),
        ("deck.pptx.part", ".pptx"),
        ("notes.md", ".md"),
        ("model.step", ".step"),
        ("plain", ""),
    ],
)
def test_detect_document_kind(path: str, expected: str) -> None:
    assert detect_document_kind(path) == expected


def test_media_type_for() -> None:
    assert media_type_for("x/report.pdf") == "application/pdf"
    assert media_type_for("notes.md") == "text/markdown"
    assert media_type_for("thing.unknown-ext") == "application/octet-stream"


# --------------------------------------------------------------------------- text backend
def test_markdown_passes_through_unchanged(tmp_path) -> None:
    src = tmp_path / "note.md"
    src.write_text("# Title\n\nbody\n", encoding="utf-8")
    doc = convert(str(src))
    assert doc.markdown == "# Title\n\nbody\n"
    assert doc.converter == "deterministic-text"
    assert doc.metadata["source"] == str(src)


def test_code_is_fenced_with_its_language(tmp_path) -> None:
    src = tmp_path / "main.py"
    src.write_text("print('hi')\n", encoding="utf-8")
    markdown = convert_to_markdown(str(src))
    assert markdown.startswith("# main.py")
    assert "```py\nprint('hi')\n\n```" in markdown or "```py" in markdown


def test_binary_stl_fallback_extracts_mesh_metadata(tmp_path) -> None:
    src = tmp_path / "mesh.stl"
    header = b"test".ljust(80, b" ")
    # One triangle: normal, three vertices, attribute byte count.
    facet = struct.pack("<12fH", 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0)
    src.write_bytes(header + struct.pack("<I", 1) + facet)
    doc = STLMetadataConverter().convert(str(src))
    assert doc.converter == "stl-metadata"
    assert "triangles: 1" in doc.markdown
    assert "dimensions (x, y, z): 1.000000, 1.000000, 0.000000" in doc.markdown


def test_latex_uses_pandoc_when_available(tmp_path) -> None:
    if shutil.which("pandoc") is None:
        pytest.skip("pandoc is not installed")
    src = tmp_path / "report.tex"
    src.write_text(r"\documentclass{article}\begin{document}\section{Intro}Text\end{document}", encoding="utf-8")
    doc = convert(str(src))
    assert doc.converter == "pandoc"
    assert "# Intro" in doc.markdown
    assert "```tex" not in doc.markdown


def test_envelope_round_trips_to_json(tmp_path) -> None:
    src = tmp_path / "a.txt"
    src.write_text("x", encoding="utf-8")
    payload = json.loads(json.dumps(convert(str(src)).to_dict()))
    # camelCase on the wire, matching the JavaScript package byte for byte.
    assert set(payload) == {
        "markdown", "metadata", "assets", "converter", "version",
        "backendType", "inputKind", "ocr", "fallbackDepth", "durationMs", "warnings",
    }


def test_operational_provenance_is_populated(tmp_path) -> None:
    src = tmp_path / "a.txt"
    src.write_text("x", encoding="utf-8")
    doc = convert(str(src))
    assert doc.backend_type == "stdlib"
    assert doc.input_kind == ".txt"
    assert doc.ocr is False
    # The markup backend sits first (so HTML is not fenced as code) and declines a .txt cheaply.
    assert doc.fallback_depth == 1, "text files are handled right after the markup backend declines"
    assert doc.duration_ms >= 0
    assert doc.warnings == []


def test_fallback_depth_counts_backends_that_declined(tmp_path) -> None:
    src = tmp_path / "a.md"
    src.write_text("x", encoding="utf-8")
    doc = ConverterChain([_Skips(), _Skips(), _Works()]).convert(str(src))
    assert doc.fallback_depth == 2, "depth must reveal a badly ordered chain"


def test_truncation_is_reported_as_a_warning(tmp_path) -> None:
    src = tmp_path / "big.txt"
    src.write_text("a" * 5000, encoding="utf-8")
    doc = TextConverter(max_chars=100).convert(str(src))
    assert any(w.startswith("TRUNCATED:100:5000") for w in doc.warnings), doc.warnings


def test_backend_type_is_declared_per_backend() -> None:
    assert TextConverter().backend_type == "stdlib"
    assert LocalToolConverter().backend_type == "binary"
    assert PyMuPDFConverter().backend_type == "python"
    assert MarkItDownConverter().backend_type == "python"
    assert DoclingHttpConverter().backend_type == "http"
    for converter in (TextConverter(), LocalToolConverter(), PyMuPDFConverter(), DoclingHttpConverter()):
        assert converter.backend_type in BACKEND_TYPES


def test_optional_backends_decline_when_their_library_is_absent(tmp_path) -> None:
    # A missing extra must route past the backend, never raise ImportError at the caller.
    src = tmp_path / "a.pdf"
    src.write_bytes(b"%PDF-1.4 not really")
    for converter in (PyMuPDFConverter(), MarkItDownConverter()):
        try:
            converter.convert(str(src))
        except ExternalConverterRequired:
            pass  # library missing, or file not supported — both are routing signals
        except ConversionError:
            pass  # library present and the fake PDF failed to parse — also acceptable
        else:
            pass  # library present and it somehow parsed; nothing to assert


def test_binary_content_is_not_treated_as_text(tmp_path) -> None:
    # A .txt full of NUL bytes is not text, whatever the extension claims.
    src = tmp_path / "fake.txt"
    src.write_bytes(b"\x00\x01\x02binary")
    with pytest.raises(ExternalConverterRequired):
        TextConverter().convert(str(src))


def test_scad_source_exposes_parametric_intent_without_docling(tmp_path) -> None:
    src = tmp_path / "lid.scad"
    src.write_text("radius = 12;\nuse <threads.scad>\ndifference() { cylinder(r=radius, h=4); }\n", encoding="utf-8")
    doc = ScadSourceConverter().convert(str(src))
    assert doc.converter == "scad-source"
    assert "radius = 12" in doc.markdown
    assert "threads.scad" in doc.markdown
    assert "cylinder, difference" in doc.markdown


def test_long_text_is_truncated(tmp_path) -> None:
    src = tmp_path / "big.txt"
    src.write_text("a" * 5000, encoding="utf-8")
    markdown = TextConverter(max_chars=100).convert(str(src)).markdown
    assert "…[truncated]" in markdown
    assert len(markdown) < 500


def test_missing_file_is_reported_clearly(tmp_path) -> None:
    with pytest.raises(ConversionError, match="FILE_NOT_FOUND"):
        convert(str(tmp_path / "nope.md"))


def test_intent_compile_removes_generated_packs_excluded_by_language_policy(tmp_path) -> None:
    source, output = tmp_path / "source", tmp_path / "dsl"
    source.mkdir()
    output.mkdir()
    (source / "kept.md").write_text("---\nlanguage: en\n---\n# Kept\nEvidence\n", encoding="utf-8")
    (source / "excluded.lt.md").write_text("---\nlanguage: lt\n---\n# Praleista\nDuomenys\n", encoding="utf-8")
    stale = output / "excluded.lt.md.intent.json"
    stale.write_text('{"schema":"t2c.intent-pack/v1","records":[{"id":"stale"}]}\n', encoding="utf-8")
    summary = compile_tree(source, output)
    assert summary["files"] == 1
    assert (output / "kept.md.intent.json").exists()
    assert not stale.exists()


def test_tree_conversion_writes_a_deterministic_version_manifest(tmp_path) -> None:
    source, output = tmp_path / "source", tmp_path / "markdown"
    source.mkdir()
    source.joinpath("note.txt").write_text("evidence", encoding="utf-8")

    convert_tree(str(source), str(output))
    first = output.joinpath("VERSION").read_text(encoding="utf-8")
    convert_tree(str(source), str(output))

    assert first == output.joinpath("VERSION").read_text(encoding="utf-8")
    assert "FORMAT=bioxfoundry.conversion-version/v1" in first
    assert "ARTIFACT=markdown-mirror" in first
    assert "SOURCE_SNAPSHOT_SHA256=" in first
    assert "OUTPUT_SNAPSHOT_SHA256=" in first


def test_intent_compile_writes_a_deterministic_version_manifest(tmp_path) -> None:
    source, output = tmp_path / "source", tmp_path / "dsl"
    source.mkdir()
    source.joinpath("note.md").write_text("---\nlanguage: en\n---\n# Evidence\nBody\n", encoding="utf-8")

    compile_tree(source, output)
    first = output.joinpath("VERSION").read_text(encoding="utf-8")
    compile_tree(source, output)

    assert first == output.joinpath("VERSION").read_text(encoding="utf-8")
    assert "ARTIFACT=markdown-intent-dsl" in first
    assert "OUTPUT_PACKS=1" in first
    assert "INTENT_RECORDS=1" in first


def test_intent_compile_hashes_source_bytes_without_normalizing_crlf(tmp_path) -> None:
    import hashlib

    source, output = tmp_path / "source", tmp_path / "dsl"
    source.mkdir()
    note = source / "note.md"
    note.write_bytes(b"---\r\nlanguage: en\r\n---\r\n# Evidence\r\nBody\r\n")

    summary = compile_tree(source, output)
    pack = json.loads(output.joinpath("note.md.intent.json").read_text(encoding="utf-8"))
    expected = hashlib.sha256(note.read_bytes()).hexdigest()

    assert summary["discoveredMarkdown"] == 1
    assert summary["eligibleFiles"] == 1
    assert summary["excludedFiles"] == 0
    assert pack["sourceHash"] == expected
    assert pack["records"][0]["source"]["revision"] == expected
    assert pack["records"][0]["metadata"]["bioxfoundry"]["sourceAnchor"]["revisionHash"] == expected


def test_intent_compile_removes_navigation_repairs_translated_terms_and_preserves_full_sections(
    tmp_path,
) -> None:
    source, output = tmp_path / "source", tmp_path / "dsl"
    source.mkdir()
    tail = "terminal-proof-marker"
    opaque = "X" * (MAX_INTENT_TEXT + 300)
    source.joinpath("study.md").write_text(
        """---
language: en
translatedFrom: lt
converter: argos
converterVersion: fixture
---
# Open source biophoundry study

Project evidence.

## Contents

| Section | Page |
|---|---|
| Requirements | 3 |

## Part III

## Safety requirements

The SLA 2 orchestrator must bind every ROM 2 action to OpenTwins.<br>Audit is required.
sila_ros is the bridge identifier.
* * 8.2 * *: """
        + "-" * 3000
        + "@@\n"
        + opaque
        + "\n"
        + """

## Implementation plan

"""
        + "word " * 900
        + tail
        + "\n",
        encoding="utf-8",
    )

    summary = compile_tree(source, output)
    pack = json.loads(output.joinpath("study.md.intent.json").read_text(encoding="utf-8"))
    records = pack["records"]
    combined = " ".join(record["statement"]["text"] for record in records)

    assert summary["failures"] == []
    assert "Contents" not in combined and "Part III: Part III" not in combined
    assert "biofoundry" in combined and "biophoundry" not in combined
    assert "SiLA 2" in combined and "ROS 2" in combined and "<br>" not in combined
    assert "sila_ros" in combined
    assert "-----" not in combined
    assert combined.count("X") == len(opaque)
    assert tail in combined, "long sections must be split, never truncated"
    assert any(record["metadata"]["bioxfoundry"]["legacyType"] == "decision" for record in records)
    assert any(record["metadata"]["bioxfoundry"]["legacyType"] == "plan" for record in records)
    assert all("#" in record["metadata"]["bioxfoundry"]["sourceAnchor"]["fragment"] for record in records)
    assert all(len(record["statement"]["text"]) <= MAX_INTENT_TEXT + len("Implementation plan: ") for record in records)


def test_legacy_structure_retains_explicit_artifact_anchor_and_page(tmp_path) -> None:
    urn = "urn:subactor:artifact:sha256:" + "ab" * 32
    source = tmp_path / "study.pdf"
    source.write_bytes(b"%PDF fixture")
    artifacts = normalize_document(
        f"<!-- source-page:3 -->\n\n<!-- artifact:{urn} id=artifact-heading-abcd -->\n# Safety\n\nEvidence.\n",
        str(source),
        normalize=False,
    )
    heading = next(block for block in artifacts.structure["blocks"] if block["type"] == "heading")
    assert heading["page"] == 3
    assert heading["artifactId"] == "artifact-heading-abcd"
    assert heading["artifactUrn"] == urn


def test_pdf_quality_v1_repairs_layout_and_preserves_uncertainty(tmp_path) -> None:
    source = tmp_path / "study.pdf"
    source.write_bytes(b"%PDF fixture")
    fixture = json.loads(
        (REPOSITORY_ROOT / "fixtures/pdf-quality/lithuanian-study.pages.json").read_text(encoding="utf-8")
    )
    pages = [PageMarkdown(page["number"], page["markdown"]) for page in fixture["pages"]]

    artifacts = normalize_document(
        "\f".join(page.markdown for page in pages),
        str(source),
        pages=pages,
        ocr_audit={"ocrActuallyUsed": True, "ocrEngine": "tesseract"},
    )

    assert "Atvirojo kodo biofoundry" not in artifacts.markdown
    assert "Integruota studija" not in artifacts.markdown
    assert "\n8\n" not in artifacts.markdown and "\n9\n" not in artifacts.markdown
    assert "<!-- source-page:2 -->" in artifacts.markdown
    assert "Gamyba" in artifacts.markdown
    assert "```bash\nsudo apt update\n```" in artifacts.markdown
    assert "<mark>" not in artifacts.markdown and "<br>" not in artifacts.markdown
    diagrams = [block for block in artifacts.structure["blocks"] if block["type"] == "diagram"]
    assert diagrams and diagrams[0]["semantic"] is False
    assert artifacts.quality["status"] == fixture["invariants"]["qualityStatus"]
    assert artifacts.quality["repairs"]["pageHeadersFootersRemoved"] == fixture["invariants"]["pageHeadersFootersRemoved"]
    assert artifacts.quality["repairs"]["pageNumbersRemoved"] == fixture["invariants"]["pageNumbersRemoved"]
    assert artifacts.quality["suspectTokens"] == ["ėNra"]


def test_ocr_token_probe_is_not_run_without_ocr(tmp_path) -> None:
    source = tmp_path / "native.pdf"
    source.write_bytes(b"%PDF fixture")
    artifacts = normalize_document("Native layout token ėNra.", str(source), normalize=False)
    check = next(item for item in artifacts.quality["checks"] if item["id"] == "OCR_SUSPECT_TOKENS")
    assert check["status"] == "not-run"
    assert check["reason"] == "ocrActuallyUsed=false"
    assert artifacts.quality["status"] == "pass"


def test_pdf_quality_v1_stitches_tables_across_pages(tmp_path) -> None:
    source = tmp_path / "table.pdf"
    source.write_bytes(b"%PDF fixture")
    pages = [
        PageMarkdown(1, "# BOM\n\n| Part | Qty |\n|---|---|\n| A | 1 |"),
        PageMarkdown(2, "| Part | Qty |\n|---|---|\n| B | 2 |\n\nDone."),
    ]

    artifacts = normalize_document("\f".join(page.markdown for page in pages), str(source), pages=pages)

    assert artifacts.markdown.count("| Part | Qty |") == 1
    assert "| A | 1 |\n| B | 2 |" in artifacts.markdown
    assert artifacts.quality["repairs"]["tablesStitched"] == 1
    assert artifacts.quality["repairs"]["repeatedTableHeadersRemoved"] == 1


def test_pdf_quality_v1_normalizes_toc_table_to_navigation_list(tmp_path) -> None:
    source = tmp_path / "toc.pdf"
    source.write_bytes(b"%PDF fixture")
    markdown = """###### Turinys

| Skyrius | Puslapis |
|---|---|
| 1 Įvadas ........ | 3 |
| 1.1 Tikslai ...... | 4 |
| 2 Metodai ........ | 8 |

# 1 Įvadas

Tekstas.
"""

    artifacts = normalize_document(markdown, str(source))

    assert "| Skyrius |" not in artifacts.markdown
    assert "- [1 Įvadas](#1-įvadas) <!-- target-page:3 -->" in artifacts.markdown
    assert "  - [1.1 Tikslai](#11-tikslai) <!-- target-page:4 -->" in artifacts.markdown
    assert artifacts.quality["repairs"]["tocBlocksNormalized"] == 1
    assert artifacts.quality["repairs"]["tocEntriesNormalized"] == 3
    navigation = [
        block for block in artifacts.structure["blocks"]
        if block.get("reason") == "table-of-contents"
    ]
    assert navigation and all(block["semantic"] is False for block in navigation)
    assert next(
        check for check in artifacts.quality["checks"] if check["id"] == "TOC_STRUCTURE"
    )["status"] == "pass"


def test_pdf_quality_v1_classifies_ascii_art_before_markdown_tables(tmp_path) -> None:
    source = tmp_path / "ascii.pdf"
    source.write_bytes(b"%PDF fixture")
    markdown = """# Architecture

| Rasp | berry |
|---|---|
| SiLA 2 Se | rver |
| [R1]||[R2] |

| Part | Qty |
|---|---|
| sensor | 2 |
"""

    artifacts = normalize_document(markdown, str(source))

    diagrams = [block for block in artifacts.structure["blocks"] if block["type"] == "diagram"]
    tables = [block for block in artifacts.structure["blocks"] if block["type"] == "table"]
    assert len(diagrams) == 1
    assert diagrams[0]["semantic"] is False
    assert diagrams[0]["reason"] == "ascii-art"
    assert "| [R1]||[R2] |" in diagrams[0]["normalizedText"]
    assert len(tables) == 1
    assert "sensor" in tables[0]["normalizedText"]
    assert artifacts.quality["repairs"]["asciiDiagramsClassified"] == 1


def test_complex_table_projection_uses_html_spans_instead_of_pipe_markdown() -> None:
    artifact = {
        "id": "artifact-table-000000000000",
        "content": {
            "rows": 2,
            "columns": 2,
            "headerRows": 1,
            "grid": [["Component", ""], ["sensor", "2"]],
            "cells": [
                {
                    "row": 0,
                    "column": 0,
                    "text": "Component & quantity",
                    "rowSpan": 1,
                    "colSpan": 2,
                },
                {"row": 1, "column": 0, "text": "sensor", "rowSpan": 1, "colSpan": 1},
                {"row": 1, "column": 1, "text": "2", "rowSpan": 1, "colSpan": 1},
            ],
        },
    }

    markdown = render_table_artifact(artifact)

    assert markdown.startswith("<table>\n")
    assert '<th colspan="2">Component &amp; quantity</th>' in markdown
    assert "|---|" not in markdown


def test_layout_first_pdf_materializes_ast_artifact_store_and_markdown_projection(tmp_path) -> None:
    pymupdf = pytest.importorskip("pymupdf")
    source, output = tmp_path / "source", tmp_path / "markdown"
    source.mkdir()
    pdf_path = source / "lab.pdf"
    pdf = pymupdf.open()
    page = pdf.new_page(width=595, height=842)
    page.insert_text((72, 72), "Lab architecture", fontsize=18)
    for x, value in zip((72, 300, 420), ("Part", "Qty", "Cost")):
        page.insert_text((x, 140), value, fontsize=10)
    for y, values in ((165, ("sensor", "2", "10")), (190, ("pump", "1", "20"))):
        for x, value in zip((72, 300, 420), values):
            page.insert_text((x, y), value, fontsize=10)
    page.insert_textbox(
        pymupdf.Rect(72, 250, 450, 320),
        "from sila2.client import SilaClient\nclient = SilaClient('127.0.0.1', 50051)",
        fontname="cour", fontsize=9,
    )
    page.insert_textbox(
        pymupdf.Rect(72, 350, 450, 450),
        "+----------------+\n| Raspberry Pi   |\n+-------+--------+\n        |\n      [R1]",
        fontname="cour", fontsize=9,
    )
    pixmap = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 100, 60), False)
    pixmap.clear_with(0x306090)
    page.insert_image(pymupdf.Rect(90, 500, 390, 680), stream=pixmap.tobytes("png"))
    pdf.save(pdf_path)
    pdf.close()

    result = convert_tree(str(source), str(output), chain=ConverterChain([PyMuPDFConverter()]))
    markdown_path = output / "lab.pdf.md"
    ast_path = output / "lab.pdf.ast.json"
    manifest_path = output / "lab.pdf.artifacts" / "manifest.json"
    ast = json.loads(ast_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    markdown = markdown_path.read_text(encoding="utf-8")
    types = {artifact["type"] for artifact in ast["artifacts"]}

    assert result.by_converter == {"pymupdf-layout": 1}
    assert ast["schema"] == "f2md.document-ast/v1"
    assert ast["extractor"]["mode"] == "layout-first"
    assert {"table", "code", "diagram", "figure"}.issubset(types)
    assert {"PART_OF", "DESCRIBES", "DEPICTS", "IMPLEMENTS"}.issubset(
        {relation["predicate"] for relation in ast["relations"]}
    )
    assert manifest["schema"] == "f2md.artifact-manifest/v1"
    assert {entry["id"] for entry in manifest["artifacts"]} == {
        artifact["id"] for artifact in ast["artifacts"]
    }
    for entry in manifest["artifacts"]:
        for uri_field, hash_field in (
            ("contentUri", "contentFileSha256"),
            ("previewUri", "previewSha256"),
            ("originalUri", "originalSha256"),
        ):
            uri, expected_hash = entry[uri_field], entry[hash_field]
            assert (uri is None) == (expected_hash is None)
            if isinstance(uri, str):
                assert hashlib.sha256((output / uri).read_bytes()).hexdigest() == expected_hash
        for derivative in entry["additionalFiles"]:
            assert hashlib.sha256((output / derivative["uri"]).read_bytes()).hexdigest() == derivative["sha256"]
    assert any(
        derivative["role"] == "table-csv"
        for entry in manifest["artifacts"] for derivative in entry["additionalFiles"]
    )
    diagram = next(artifact for artifact in ast["artifacts"] if artifact["type"] == "diagram")
    diagram_entry = next(entry for entry in manifest["artifacts"] if entry["id"] == diagram["id"])
    graph = diagram["content"]["graph"]
    assert graph["schema"] == "f2md.diagram-graph/v1"
    assert graph["validation"]["valid"] is True
    assert graph["validation"]["sourceHashMatches"] is True
    assert json.loads((output / diagram_entry["contentUri"]).read_text(encoding="utf-8")) == graph
    assert {node["label"] for node in graph["nodes"]} == {"Raspberry Pi", "R1"}
    assert str(diagram_entry["previewUri"]).endswith("diagram.svg")
    assert str(diagram_entry["originalUri"]).endswith("original.png")
    assert {item["role"] for item in diagram_entry["additionalFiles"]} == {
        "diagram-source-text", "diagram-mermaid", "diagram-dsl",
    }
    assert "```python" in markdown and "```text" in markdown
    assert "| Part | Qty | Cost |" in markdown
    assert str(diagram_entry["previewUri"]) in markdown
    assert str(diagram_entry["originalUri"]) in markdown
    assert "<summary>Source diagram crop</summary>" in markdown
    assert "<!-- artifact:urn:subactor:artifact:sha256:" in markdown
    assert "sourceModel: \"f2md.document-ast/v1\"" in markdown
    assert (output / "lab.pdf.artifacts" / "artifacts.dsl").is_file()
    assert (output / "lab.pdf.artifacts" / "artifact-quality.dsl").is_file()
    assert (output / "lab.pdf.artifacts" / "artifact-tree.dsl").is_file()
    version = (output / "VERSION").read_text(encoding="utf-8")
    assert "OUTPUT_FILES=1\n" in version
    assert "ASSET_FILES=0\n" not in version
    assert audit_markdown_tree(source, output).errors == 0

    projected = next(entry for entry in manifest["artifacts"] if isinstance(entry["contentUri"], str))
    projected_path = output / projected["contentUri"]
    projected_bytes = projected_path.read_bytes()
    projected_path.write_bytes(projected_bytes + b"tampered")
    tampered_projection = audit_markdown_tree(source, output)
    assert any(
        finding.code == "DOCUMENT_AST_CONTRACT_INVALID"
        and "ARTIFACT_FILE_HASH_MISMATCH" in finding.message
        for finding in tampered_projection.findings
    )
    projected_path.write_bytes(projected_bytes)

    derivative = next(
        derivative
        for entry in manifest["artifacts"] for derivative in entry["additionalFiles"]
    )
    derivative_path = output / derivative["uri"]
    derivative_bytes = derivative_path.read_bytes()
    derivative_path.write_bytes(derivative_bytes + b"tampered")
    tampered_derivative = audit_markdown_tree(source, output)
    assert any(
        finding.code == "DOCUMENT_AST_CONTRACT_INVALID"
        and "ARTIFACT_ADDITIONAL_FILE_HASH_MISMATCH" in finding.message
        for finding in tampered_derivative.findings
    )
    derivative_path.write_bytes(derivative_bytes)

    manifest["artifacts"][0]["contentSha256"] = "0" * 64
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    tampered = audit_markdown_tree(source, output)
    assert any(finding.code == "DOCUMENT_AST_CONTRACT_INVALID" for finding in tampered.findings)


def test_ascii_graph_is_source_bound_and_has_deterministic_mermaid_svg_and_dsl() -> None:
    source = """[ChemOS AI Planner]
|
v
[OpenTwins]
|
v
[Physical devices]
"""
    graph = build_ascii_diagram_graph(source)

    assert graph is not None
    assert graph["generation"] == "deterministic-ascii-v1"
    assert [node["label"] for node in graph["nodes"]] == [
        "ChemOS AI Planner", "OpenTwins", "Physical devices",
    ]
    assert len(graph["edges"]) == 2
    assert diagram_graph_metrics(graph, source)["valid"] is True
    assert render_diagram_mermaid(graph, source).startswith("flowchart TD\n")
    assert "marker-end=\"url(#arrow)\"" in render_diagram_svg(graph, source)
    assert render_diagram_dsl(
        "urn:subactor:artifact:sha256:" + "a" * 64, graph, source
    ).endswith(
        "END_DIAGRAM_GRAPH\n"
    )

    tampered = json.loads(json.dumps(graph))
    tampered["nodes"][0]["label"] = "Invented component"
    assert diagram_graph_metrics(tampered, source)["valid"] is False
    stale = json.loads(json.dumps(graph))
    stale["sourceTextSha256"] = "0" * 64
    assert diagram_graph_metrics(stale, source)["sourceHashMatches"] is False
    with pytest.raises(ValueError, match="DIAGRAM_GRAPH_INVALID"):
        render_diagram_mermaid(stale, source)


def test_real_biofoundry_pdf_preserves_typed_artifact_invariants(tmp_path) -> None:
    pytest.importorskip("pymupdf")
    fixture = json.loads(
        (REPOSITORY_ROOT / "fixtures/pdf-quality/atvirojo-artifact-invariants.json").read_text(
            encoding="utf-8"
        )
    )
    configured = os.environ.get("F2MD_QUALITY_PDF")
    source = Path(configured) if configured else (
        REPOSITORY_ROOT.parent
        / "projects/nanobionic-laboratory/imports/customer/A.-SPECIFIKACIJA-76173b04"
        / fixture["sourceBasename"]
    )
    if not source.is_file():
        pytest.skip("real biofoundry PDF corpus is not available")
    expected = fixture["invariants"]
    assert hashlib.sha256(source.read_bytes()).hexdigest() == fixture["sourceSha256"]

    ast = extract_pdf_ast(str(source))
    markdown = render_markdown(ast)
    quality = markdown_quality_from_ast(ast, markdown, artifact_quality(ast))
    artifacts = ast["artifacts"]
    tables = [artifact for artifact in artifacts if artifact["type"] == "table"]
    diagrams = [artifact for artifact in artifacts if artifact["type"] == "diagram"]
    code = [artifact for artifact in artifacts if artifact["type"] == "code"]

    assert ast["schema"] == expected["sourceModel"]
    assert ast["ocr"]["actuallyUsed"] is False
    assert quality["status"] == expected["qualityStatus"]
    assert len(quality["suspectTokens"]) >= expected["minimumSuspectTokens"]
    assert len(tables) >= expected["minimumTables"]
    assert len(code) >= expected["minimumCodeArtifacts"]
    assert sum(artifact["subtype"] == "ascii-diagram" for artifact in diagrams) >= expected["minimumAsciiDiagrams"]
    assert sum(artifact["subtype"] == "table-of-contents" for artifact in artifacts) >= expected["minimumTocArtifacts"]
    assert set(expected["requiredCodeLanguages"]).issubset(
        {artifact["content"]["language"] for artifact in code}
    )
    assert set(expected["requiredRelationPredicates"]).issubset(
        {relation["predicate"] for relation in ast["relations"]}
    )
    for pages in expected["crossPageTables"]:
        assert any(artifact["pages"] == pages for artifact in tables)

    biospec = next(
        artifact for artifact in diagrams
        if expected["biospecDiagramPage"] in artifact["pages"]
        and all(token in artifact["content"]["text"] for token in expected["biospecDiagramTokens"])
    )
    assert biospec["subtype"] == "ascii-diagram"
    assert biospec["content"]["graph"]["validation"]["valid"] is True
    assert {"R1", "R2", "R3", "R4"}.issubset({
        node["label"] for node in biospec["content"]["graph"]["nodes"]
    })
    assert not any("[R1]" in json.dumps(table["content"], ensure_ascii=False) for table in tables)
    open_twins = next(
        artifact
        for artifact in diagrams
        if expected["openTwinsDiagramPage"] in artifact["pages"]
        and all(token in artifact["content"]["text"] for token in expected["openTwinsDiagramTokens"])
    )
    assert open_twins["content"]["graph"]["validation"]["valid"] is True
    assert {"ChemOS 2.0 (AI Planner + UI)", "OpenTwins Core"}.issubset({
        node["label"] for node in open_twins["content"]["graph"]["nodes"]
    })
    focused_ast = {**ast, "artifacts": [open_twins], "relations": []}
    ast_path = tmp_path / "opentwins.ast.json"
    markdown_path = tmp_path / "opentwins.md"
    ast_path.write_text(json.dumps(focused_ast), encoding="utf-8")
    manifest = materialize_artifact_store(
        focused_ast, str(source), str(markdown_path), str(ast_path),
    )
    entry = manifest["artifacts"][0]
    assert str(entry["contentUri"]).endswith("graph.json")
    assert str(entry["previewUri"]).endswith("diagram.svg")
    assert str(entry["originalUri"]).endswith("original.png")
    assert {item["role"] for item in entry["additionalFiles"]} == {
        "diagram-source-text", "diagram-mermaid", "diagram-dsl",
    }
    projected_markdown = render_markdown(focused_ast, manifest)
    assert str(entry["previewUri"]) in projected_markdown
    assert str(entry["originalUri"]) in projected_markdown
    assert any(
        expected["biospecBomPage"] in table["pages"]
        and all(token in json.dumps(table["content"]["grid"], ensure_ascii=False)
                for token in expected["biospecBomTokens"])
        for table in tables
    )
    assert all(value not in markdown for value in expected["forbiddenVisibleFurniture"])


class _CoverageConverter:
    name = "coverage-fixture"
    backend_type = "stdlib"

    def convert(self, path: str) -> ConvertedDocument:
        kind = Path(path).suffix
        if kind == ".bin":
            raise ExternalConverterRequired(kind)
        if kind == ".broken":
            raise ConversionError("FIXTURE_BACKEND_FAILED:deliberate")
        converter = "stl-metadata" if kind == ".stl" else self.name
        return ConvertedDocument(
            f"# {Path(path).name}\n",
            {"size": Path(path).stat().st_size, "mtime": ""},
            [],
            converter,
            "1",
            backend_type=self.backend_type,
            input_kind=kind,
        )


def test_source_coverage_accounts_for_every_terminal_state_and_is_idempotent(tmp_path) -> None:
    source, output = tmp_path / "source", tmp_path / "markdown"
    source.mkdir()
    (source / "note.md").write_text("# One\n", encoding="utf-8")
    (source / "mesh.stl").write_bytes(b"binary provenance")
    (source / "opaque.bin").write_bytes(b"unsupported")
    (source / "backend.broken").write_bytes(b"failure")
    chain = ConverterChain([_CoverageConverter()])

    first = convert_tree(str(source), str(output), chain=chain)
    report_path = output / "source-coverage.json"
    dsl_path = output / "source-coverage.dsl"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    first_json = report_path.read_bytes()
    first_dsl = dsl_path.read_bytes()

    assert first.coverage_no_change is False
    assert report["schema"] == "bioxfoundry.source-coverage/v1"
    assert report["summary"]["discovered"] == report["summary"]["terminal"] == 4
    assert report["summary"]["byState"] == {
        "converted": 1,
        "binary-provenance": 1,
        "excluded-by-policy": 0,
        "unsupported": 1,
        "quarantined": 0,
        "failed": 1,
    }
    assert [record["path"] for record in report["records"]] == [
        "backend.broken", "mesh.stl", "note.md", "opaque.bin",
    ]
    assert all(record["twinRevisionStatus"] == "not-evaluated" for record in report["records"])
    assert "RESULT COMPLETE" in first_dsl.decode("utf-8")

    second = convert_tree(str(source), str(output), chain=chain)
    assert second.coverage_no_change is True
    assert report_path.read_bytes() == first_json
    assert dsl_path.read_bytes() == first_dsl

    before = {record["path"]: record for record in report["records"]}
    (source / "note.md").write_text("# Two\n", encoding="utf-8")
    third = convert_tree(str(source), str(output), chain=chain)
    changed = json.loads(report_path.read_text(encoding="utf-8"))
    after = {record["path"]: record for record in changed["records"]}
    assert third.coverage_no_change is False
    assert before["note.md"]["sourceSha256"] != after["note.md"]["sourceSha256"]
    assert before["note.md"]["resourceUri"] != after["note.md"]["resourceUri"]
    assert before["mesh.stl"] == after["mesh.stl"]
    assert before["opaque.bin"] == after["opaque.bin"]
    assert before["backend.broken"] == after["backend.broken"]

    filtered_output = tmp_path / "filtered"
    filtered = convert_tree(str(source), str(filtered_output), chain=chain, only=[".md"])
    filtered_report = json.loads((filtered_output / "source-coverage.json").read_text(encoding="utf-8"))
    assert filtered.skipped == 3
    assert filtered_report["summary"]["discovered"] == filtered_report["summary"]["terminal"] == 4
    assert filtered_report["summary"]["byState"]["excluded-by-policy"] == 3
    assert all(
        record["reasonCode"] == "KIND_NOT_SELECTED"
        for record in filtered_report["records"] if record["state"] == "excluded-by-policy"
    )


def test_tree_selection_manifest_converts_only_hash_bound_files_and_rejects_drift(tmp_path) -> None:
    source, output = tmp_path / "source", tmp_path / "markdown"
    (source / "device").mkdir(parents=True)
    selected = b'syntax = "proto3";\n'
    (source / "device" / "control.proto").write_bytes(selected)
    (source / "raw.csv").write_text("measurement\n", encoding="utf-8")
    manifest = tmp_path / "selection.json"
    manifest.write_text(json.dumps({
        "schema": "bioxfoundry.source-selection/v1",
        "id": "device-evidence",
        "entries": [{
            "path": "device/control.proto",
            "sha256": hashlib.sha256(selected).hexdigest(),
            "family": "device",
            "expectedUse": "interface",
            "reason": "Defines the device RPC contract.",
        }],
    }), encoding="utf-8")

    result = convert_tree(str(source), str(output), manifest_path=str(manifest))
    assert result.converted == 1
    assert detect_document_kind("control.proto") == ".proto"
    assert media_type_for("control.proto") == "text/x-protobuf"
    assert "```proto" in (output / "device" / "control.proto.md").read_text(encoding="utf-8")
    assert not (output / "raw.csv.md").exists()

    (source / "device" / "control.proto").write_text("changed\n", encoding="utf-8")
    with pytest.raises(ConversionError, match="SOURCE_SELECTION_HASH_MISMATCH"):
        convert_tree(str(source), str(tmp_path / "drifted"), manifest_path=str(manifest))


class _PdfQualityFixture:
    name = "pdf-quality-fixture"

    def convert(self, path: str) -> ConvertedDocument:
        pages = [
            {"number": 1, "markdown": "# Evidence\n\nVerified statement."},
            {
                "number": 2,
                "markdown": "<!-- Start of picture text -->low confidence OCR<!-- End of picture text -->",
            },
        ]
        return ConvertedDocument(
            "\f".join(page["markdown"] for page in pages),
            {"size": os.path.getsize(path), "mtime": "", "_f2mdPages": pages},
            [],
            self.name,
            "1",
            input_kind=".pdf",
        )


def test_tree_emits_quality_structure_and_intent_uses_only_semantic_blocks(tmp_path) -> None:
    source, markdown_root, intent_root = tmp_path / "source", tmp_path / "markdown", tmp_path / "intent"
    source.mkdir()
    (source / "study.pdf").write_bytes(b"%PDF fixture")

    result = convert_tree(str(source), str(markdown_root), chain=ConverterChain([_PdfQualityFixture()]))
    markdown_path = markdown_root / "study.pdf.md"
    structure_path = markdown_root / "study.pdf.structure.json"
    quality_path = markdown_root / "study.pdf.quality.mdqldsl"

    assert result.by_quality == {"degraded": 1}
    assert structure_path.is_file() and quality_path.is_file()
    assert 'qualityStatus: "degraded"' in markdown_path.read_text(encoding="utf-8")
    assert "STATUS DEGRADED" in quality_path.read_text(encoding="utf-8")
    structure = json.loads(structure_path.read_text(encoding="utf-8"))
    assert structure["schema"] == "bioxfoundry.document-structure/v1"
    audit = audit_markdown_tree(source, markdown_root)
    assert audit.errors == 0
    assert any(finding.code == "MARKDOWN_QUALITY_DEGRADED" for finding in audit.findings)

    blocked = compile_tree(markdown_root, intent_root, only_english=False)
    assert blocked["eligibleFiles"] == 0
    assert blocked["exclusions"][0]["reason"] == "conversion-quality-policy"

    admitted = compile_tree(markdown_root, intent_root, only_english=False, allow_degraded=True)
    pack = json.loads((intent_root / "study.pdf.md.intent.json").read_text(encoding="utf-8"))
    assert admitted["files"] == 1
    assert "Verified statement" in pack["records"][0]["statement"]["text"]
    assert all("low confidence OCR" not in record["statement"]["text"] for record in pack["records"])
    assert pack["records"][0]["metadata"]["bioxfoundry"]["sourceAnchor"]["blockId"].startswith("block-")


def test_tree_materializes_pdf_figure_with_bbox_hash_and_ocr_region(tmp_path) -> None:
    pymupdf = pytest.importorskip("pymupdf")
    source, markdown_root = tmp_path / "source", tmp_path / "markdown"
    source.mkdir()
    pdf_path = source / "diagram.pdf"
    pdf = pymupdf.open()
    page = pdf.new_page(width=595, height=842)
    page.insert_text((72, 72), "Architecture", fontsize=18)
    pixmap = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 180, 90), False)
    pixmap.clear_with(0x70A0D0)
    page.insert_image(pymupdf.Rect(90, 180, 450, 360), stream=pixmap.tobytes("png"))
    pdf.save(pdf_path)
    pdf.close()

    class PictureFixture:
        name = "pymupdf4llm"

        def convert(self, path: str) -> ConvertedDocument:
            picture = (
                "# Architecture\n\n<!-- Start of picture text -->"
                "controller <br> sensor<!-- End of picture text -->"
            )
            return ConvertedDocument(
                picture,
                {
                    "_f2mdPages": [{"number": 1, "markdown": picture, "width": 595, "height": 842}],
                    "ocrAudit": {
                        "ocrRequested": False,
                        "ocrActuallyUsed": False,
                        "ocrEngine": "none",
                        "ocrVersion": "unknown",
                        "ocrLanguages": [],
                        "ocrPages": [],
                        "ocrRegions": [],
                        "ocrConfidence": None,
                    },
                },
                converter=self.name,
                version="fixture",
                input_kind=".pdf",
            )

    result = convert_tree(str(source), str(markdown_root), chain=ConverterChain([PictureFixture()]))

    assets = list((markdown_root / "diagram.pdf.assets").glob("page-1-figure-1-*.png"))
    assert result.by_quality == {"pass": 1}
    assert len(assets) == 1
    markdown = (markdown_root / "diagram.pdf.md").read_text(encoding="utf-8")
    assert f"](diagram.pdf.assets/{assets[0].name})" in markdown
    assert 'ocrActuallyUsed: true' in markdown
    structure = json.loads(
        (markdown_root / "diagram.pdf.structure.json").read_text(encoding="utf-8")
    )
    figure = next(block for block in structure["blocks"] if block["type"] == "figure")
    diagram = next(block for block in structure["blocks"] if block["type"] == "diagram")
    heading = next(block for block in structure["blocks"] if block["type"] == "heading")
    assert figure["bbox"] == diagram["bbox"] == [90.0, 180.0, 450.0, 360.0]
    assert heading["bbox"] is not None
    assert structure["layoutAudit"]["status"] == "pass"
    assert structure["layoutAudit"]["coverage"] == 1.0
    assert figure["assetSha256"] == hashlib.sha256(assets[0].read_bytes()).hexdigest()
    assert structure["ocr"]["ocrPages"] == [1]
    assert structure["ocr"]["ocrRegions"][0]["bbox"] == figure["bbox"]
    assert "ASSET_FILES=1" in (markdown_root / "VERSION").read_text(encoding="utf-8")
    audit = audit_markdown_tree(source, markdown_root)
    assert audit.errors == 0
    assert audit.metrics["assetFiles"] == 1

    assets[0].write_bytes(b"tampered")
    tampered = audit_markdown_tree(source, markdown_root)
    assert any(finding.code == "DOCUMENT_ASSET_HASH_MISMATCH" for finding in tampered.findings)


def test_refresh_contract_recounts_a_specialised_intent_pack(tmp_path) -> None:
    source, output = tmp_path / "source", tmp_path / "dsl"
    source.mkdir()
    note = source / "note.md"
    note.write_text("---\nlanguage: en\n---\n# Evidence\nBody\n", encoding="utf-8")
    compile_tree(source, output)
    pack_path = output / "note.md.intent.json"
    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    pack["records"].append({**pack["records"][0], "id": "INT-DOC-" + "f" * 20})
    pack_path.write_text(json.dumps(pack), encoding="utf-8")

    summary = refresh_contract(source, output)

    assert summary["records"] == 2
    assert "INTENT_RECORDS=2" in output.joinpath("VERSION").read_text(encoding="utf-8")


def test_refresh_output_identity_tracks_normalized_pack_bytes(tmp_path) -> None:
    source = tmp_path / "source"
    output = tmp_path / "output"
    source.mkdir()
    (source / "README.md").write_text("# Device\n\nWidth is 42 mm.\n", encoding="utf-8")
    compile_tree(source, output, only_english=False)
    pack_path = next(output.rglob("*.intent.json"))
    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    pack["source"] = "dodsl://project/device/source-md/README.md"
    for record in pack["records"]:
        bioxfoundry = record.get("metadata", {}).get("bioxfoundry", {})
        if isinstance(bioxfoundry.get("sourceAnchor"), dict):
            bioxfoundry["sourceAnchor"]["artifactUri"] = pack["source"]
            bioxfoundry["targetUris"] = [pack["source"]]
    pack_path.write_text(json.dumps(pack, indent=2) + "\n", encoding="utf-8")

    first = refresh_output_identity(output)
    first_version = (output / "VERSION").read_text(encoding="utf-8")
    second = refresh_output_identity(output)

    assert first == second
    assert (output / "VERSION").read_text(encoding="utf-8") == first_version
    assert f"OUTPUT_SNAPSHOT_SHA256={first['outputSnapshotSha256']}" in first_version


def test_refresh_contract_rejects_source_hash_drift(tmp_path) -> None:
    source, output = tmp_path / "source", tmp_path / "dsl"
    source.mkdir()
    note = source / "note.md"
    note.write_text("---\nlanguage: en\n---\n# Evidence\nBody\n", encoding="utf-8")
    compile_tree(source, output)
    pack_path = output / "note.md.intent.json"
    pack = json.loads(pack_path.read_text(encoding="utf-8"))
    pack["sourceHash"] = "0" * 64
    pack_path.write_text(json.dumps(pack), encoding="utf-8")

    with pytest.raises(ValueError, match="INTENT_SOURCE_HASH_MISMATCH"):
        refresh_contract(source, output)


# --------------------------------------------------------------------------- chain routing
class _Skips:
    name = "skips"

    def convert(self, path: str) -> ConvertedDocument:
        raise ExternalConverterRequired(".pdf")


class _Breaks:
    name = "breaks"

    def convert(self, path: str) -> ConvertedDocument:
        raise ConversionError("BACKEND_EXPLODED")


class _Works:
    name = "works"

    def convert(self, path: str) -> ConvertedDocument:
        return ConvertedDocument("# ok", {}, [], "works", "1")


class _DegradedPdf:
    name = "degraded-pdf"

    def convert(self, path: str) -> ConvertedDocument:
        return ConvertedDocument(
            "<!-- Start of picture text -->uncertain diagram<!-- End of picture text -->",
            {}, [], self.name, "1", input_kind=".pdf",
        )


class _CanonicalPdf:
    name = "canonical-pdf"

    def convert(self, path: str) -> ConvertedDocument:
        return ConvertedDocument("# Evidence\n\nCanonical body.\n", {}, [], self.name, "1", input_kind=".pdf")


def test_chain_skips_inapplicable_backends(tmp_path) -> None:
    src = tmp_path / "a.md"
    src.write_text("x", encoding="utf-8")
    assert ConverterChain([_Skips(), _Works()]).convert(str(src)).converter == "works"


def test_chain_surfaces_a_real_failure_rather_than_unsupported_format(tmp_path) -> None:
    # A broken backend must not be reported as "no converter handles this file".
    src = tmp_path / "a.md"
    src.write_text("x", encoding="utf-8")
    with pytest.raises(ConversionError, match="BACKEND_EXPLODED"):
        ConverterChain([_Breaks(), _Skips()]).convert(str(src))


def test_chain_prefers_a_later_success_over_an_earlier_failure(tmp_path) -> None:
    src = tmp_path / "a.md"
    src.write_text("x", encoding="utf-8")
    assert ConverterChain([_Breaks(), _Works()]).convert(str(src)).converter == "works"


def test_document_chain_arbitrates_quality_instead_of_first_success(tmp_path) -> None:
    src = tmp_path / "study.pdf"
    src.write_bytes(b"%PDF fixture")

    document = ConverterChain([_DegradedPdf(), _CanonicalPdf()]).convert(str(src))

    assert document.converter == "canonical-pdf"
    arbitration = document.metadata["qualityArbitration"]
    assert arbitration["strategy"] == "highest-quality-score-v1"
    assert [candidate["status"] for candidate in arbitration["candidates"]] == ["degraded", "pass"]
    assert document.fallback_depth == 1


def test_empty_chain_is_rejected() -> None:
    with pytest.raises(ValueError):
        ConverterChain([])


# --------------------------------------------------------------------------- docling over http
class _DoclingHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length)
        payload = json.dumps(
            {"markdown": "# from docling", "converter": "docling", "metadata": {"bytes": len(body)}}
        ).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args: object) -> None:  # keep test output clean
        return


def test_docling_http_backend_round_trip(tmp_path) -> None:
    server = HTTPServer(("127.0.0.1", 0), _DoclingHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        src = tmp_path / "scan.pdf"
        src.write_bytes(b"%PDF-1.4 fake")
        url = f"http://127.0.0.1:{server.server_port}"
        doc = DoclingHttpConverter(url).convert(str(src))
        assert doc.markdown == "# from docling"
        assert doc.converter == "docling"
        assert doc.metadata["bytes"] > 0, "multipart body must carry the file"
    finally:
        server.shutdown()


def test_docling_http_failure_is_a_conversion_error(tmp_path) -> None:
    src = tmp_path / "scan.pdf"
    src.write_bytes(b"%PDF-1.4 fake")
    # Port 1 is not listening; the connection error must arrive as a ConversionError.
    with pytest.raises(ConversionError, match="DOCLING_HTTP"):
        DoclingHttpConverter("http://127.0.0.1:1", timeout_s=2).convert(str(src))


def test_docling_declines_mesh_before_network_io(tmp_path) -> None:
    src = tmp_path / "model.glb"
    src.write_bytes(b"glTF")
    with pytest.raises(ExternalConverterRequired, match=r"EXTERNAL_CONVERTER_REQUIRED:\.glb"):
        DoclingHttpConverter("http://127.0.0.1:1", timeout_s=2).convert(str(src))


# --------------------------------------------------------------------------- cli
def test_cli_emits_markdown(tmp_path, capsys) -> None:
    src = tmp_path / "note.md"
    src.write_text("# Hello\n", encoding="utf-8")
    assert main([str(src)]) == 0
    assert "# Hello" in capsys.readouterr().out


def test_cli_json_envelope(tmp_path, capsys) -> None:
    src = tmp_path / "note.md"
    src.write_text("# Hello\n", encoding="utf-8")
    assert main([str(src), "--json"]) == 0
    payload = json.loads(capsys.readouterr().out.strip())
    assert payload["converter"] == "deterministic-text"


def test_cli_detect_mode(tmp_path, capsys) -> None:
    assert main(["imports/report.pdf-9f2c", "--detect"]) == 0
    payload = json.loads(capsys.readouterr().out.strip())
    assert payload["kind"] == ".pdf"
    assert payload["mediaType"] == "application/pdf"


def test_cli_reports_failure_on_stderr_and_exits_nonzero(tmp_path, capsys) -> None:
    assert main([str(tmp_path / "missing.md")]) == 1
    captured = capsys.readouterr()
    assert "FILE_NOT_FOUND" in captured.err
    assert captured.out == "", "stdout must stay clean so redirection is usable"


def test_cli_json_stays_parseable_when_a_backend_prints(tmp_path) -> None:
    """PyMuPDF prints banners from its C extension straight to fd 1.

    `contextlib.redirect_stdout` only rebinds `sys.stdout` and misses that, so without fd-level
    capture `f2md file --json | jq` fails on the noise. Run through a real subprocess: that is the
    contract users depend on, and pytest's own capture would mask the leak.
    """
    pytest.importorskip("pymupdf")
    pdf = tmp_path / "doc.pdf"
    pdf.write_bytes(_MINIMAL_PDF)
    done = subprocess.run(
        [sys.executable, "-m", "f2md.cli", str(pdf), "--json"],
        capture_output=True, timeout=300, check=False,
    )
    assert done.returncode == 0, done.stderr.decode()
    payload = json.loads(done.stdout.decode())  # must parse with no leading noise
    assert payload["converter"] == "pymupdf-layout", payload["converter"]
    assert payload["backendType"] == "python"
    assert payload["fallbackDepth"] >= 1, "text backend must decline a PDF first"


def _build_minimal_pdf() -> bytes:
    text = b"Strefa Build ma 12.4 x 14.2 m i miesci liquid_handler_01 oraz sequencing_01"
    content = b"BT /F1 14 Tf 60 700 Td (" + text + b") Tj ET"
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(content)).encode() + b" >>stream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = b"%PDF-1.4\n"
    offsets = []
    for index, obj in enumerate(objs, 1):
        offsets.append(len(out))
        out += str(index).encode() + b" 0 obj\n" + obj + b"\nendobj\n"
    start = len(out)
    out += b"xref\n0 " + str(len(objs) + 1).encode() + b"\n0000000000 65535 f \n"
    for offset in offsets:
        out += ("%010d 00000 n \n" % offset).encode()
    out += (
        b"trailer\n<< /Size " + str(len(objs) + 1).encode() + b" /Root 1 0 R >>\nstartxref\n"
        + str(start).encode() + b"\n%%EOF\n"
    )
    return out


_MINIMAL_PDF = _build_minimal_pdf()


def test_cli_materialize_to_exposes_output_aware_ast_contract(tmp_path, capsys) -> None:
    pytest.importorskip("pymupdf")
    source = tmp_path / "source.pdf"
    target = tmp_path / "mirror" / "source.pdf.md"
    source.write_bytes(_MINIMAL_PDF)

    assert main([str(source), "--json", "--materialize-to", str(target)]) == 0
    payload = json.loads(capsys.readouterr().out)

    assert payload["metadata"]["documentAst"]["schema"] == "f2md.document-ast/v1"
    assert payload["metadata"]["documentAstArtifact"] == "source.pdf.ast.json"
    assert (tmp_path / "mirror" / "source.pdf.ast.json").is_file()
    assert (tmp_path / "mirror" / "source.pdf.artifacts" / "manifest.json").is_file()
    assert (tmp_path / "mirror" / "source.pdf.artifacts" / "artifact-tree.dsl").is_file()


def test_pymupdf_layout_provenance_is_deterministic_between_files(tmp_path) -> None:
    """Native layout conversion cannot inherit OCR state from an earlier document."""
    pytest.importorskip("pymupdf")
    converter = PyMuPDFConverter()

    src = tmp_path / "clean.pdf"
    src.write_bytes(_MINIMAL_PDF)

    first = converter.convert(str(src))
    second = converter.convert(str(src))
    assert first.ocr == second.ocr
    assert first.warnings == second.warnings, "provenance must not depend on conversion order"
    assert first.metadata["documentAst"] == second.metadata["documentAst"]


def test_tree_marks_confidential_documents_in_the_filename(tmp_path) -> None:
    src = tmp_path / "src"
    src.mkdir()
    (src / "public.md").write_text("# Public\n\nNothing sensitive here.\n", encoding="utf-8")
    (src / "deal.md").write_text("# Offer\n\nKONFIDENCIALU - internal only\n", encoding="utf-8")
    out = tmp_path / "out"

    result = convert_tree(str(src), str(out), secret_pattern="konfidencial")
    assert result.confidential == 1
    assert (out / "deal.md.secret.md").is_file(), sorted(p.name for p in out.iterdir())
    assert (out / "public.md.md").is_file()
    assert not (out / "deal.md.md").exists(), "a confidential file must not also land unmarked"
    assert 'confidential: true' in (out / "deal.md.secret.md").read_text(encoding="utf-8")
    assert 'confidential: false' in (out / "public.md.md").read_text(encoding="utf-8")


def test_tree_without_a_pattern_marks_nothing(tmp_path) -> None:
    # Guessing confidentiality misfires both ways, so there is deliberately no default pattern.
    src = tmp_path / "src"
    src.mkdir()
    (src / "deal.md").write_text("KONFIDENCIALU\n", encoding="utf-8")
    out = tmp_path / "out"
    result = convert_tree(str(src), str(out))
    assert result.confidential == 0
    assert (out / "deal.md.md").is_file()


def test_source_is_absolute_even_when_called_with_a_relative_path(tmp_path, monkeypatch) -> None:
    """A relative path cannot be resolved later from a different working directory."""
    src = tmp_path / "note.md"
    src.write_text("# Hi\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)
    doc = convert("note.md")
    assert os.path.isabs(doc.metadata["source"]), doc.metadata["source"]
    assert doc.metadata["source"] == str(src.resolve())


def test_tree_records_both_absolute_and_tree_relative_source(tmp_path) -> None:
    src = tmp_path / "src" / "deep"
    src.mkdir(parents=True)
    (src / "a.md").write_text("# A\n", encoding="utf-8")
    out = tmp_path / "out"
    convert_tree(str(tmp_path / "src"), str(out))
    text = (out / "deep" / "a.md.md").read_text(encoding="utf-8")
    assert f'source: "{(src / "a.md").resolve()}"' in text
    assert 'sourceRelative: "deep/a.md"' in text


def test_tree_can_preserve_a_parent_relative_provenance_prefix(tmp_path) -> None:
    src = tmp_path / "src"
    src.mkdir()
    (src / "a.md").write_text("# A\n", encoding="utf-8")
    out = tmp_path / "out"
    convert_tree(str(src), str(out), relative_prefix="A. SPECIFIKACIJA")
    text = (out / "a.md.md").read_text(encoding="utf-8")
    assert 'sourceRelative: "A. SPECIFIKACIJA/a.md"' in text


# --------------------------------------------------------------------- translation routing
def test_hybrid_policy_keeps_confidential_documents_offline() -> None:
    from f2md.translate import TranslationPolicy

    policy = TranslationPolicy("hybrid", "en")
    assert policy.engine_for(confidential=True) == "argos", "confidential text must not leave the host"
    assert policy.engine_for(confidential=False) == "openrouter"


def test_hosted_only_policy_refuses_confidential_documents() -> None:
    from f2md.translate import TranslationPolicy, TranslationUnavailable

    policy = TranslationPolicy("openrouter", "en")
    # Refused rather than silently downgraded: a policy that can leak is not a policy.
    with pytest.raises(TranslationUnavailable, match="CONFIDENTIAL_REFUSED"):
        policy.engine_for(confidential=True)


def test_offline_only_policy_never_uses_the_network() -> None:
    from f2md.translate import TranslationPolicy

    policy = TranslationPolicy("argos", "en")
    assert policy.engine_for(confidential=True) == "argos"
    assert policy.engine_for(confidential=False) == "argos"


def test_unknown_policy_is_rejected() -> None:
    from f2md.translate import TranslationPolicy

    with pytest.raises(ConversionError, match="TRANSLATION_POLICY_INVALID"):
        TranslationPolicy("send-it-anywhere", "en")


def test_argos_preserves_technical_terms_tables_and_text_after_code() -> None:
    from f2md.translate import ArgosTranslator

    class Pair:
        def translate(self, value: str) -> str:
            return (
                value.replace("Diegimas", "Deployment")
                .replace("Komponentas", "Component")
                .replace("Valdymas", "Control")
                .replace("Ataskaita", "Report")
                .replace("jutiklis", "sensor")
                .replace("SiLA", "Syla")
                .replace("ROS", "ROM")
            )

    translator = ArgosTranslator("en")
    translator._installed[("lt", "en")] = Pair()
    source = """<!-- artifact:urn:subactor:artifact:sha256:abcd id=artifact-heading-abcd -->
# SiLA 2 Diegimas

| Komponentas | Protokolas |
|---|---|
| jutiklis | ROS 2 |

<!-- artifact:urn:subactor:artifact:sha256:efgh id=artifact-code-efgh -->
```bash
python -m sila2.server
```

## OpenTwins Valdymas

ChemOS 2.0 valdo biofoundry dark-factory.

SiLA client links ROS data.
sila_ros remains stable.
Reach ≈0,5 m and price ≈6000 EUR; total ≈3 850–7 800.
Laminar Flow Hood remains evidence.

![Reconstructed diagram](study.lt.artifacts/diagrams/a/diagram.svg)

<details>
<summary>Šaltinio diagrama</summary>

[Ataskaita](reports/source.md) uses `sila_base` with GLS80, HEPA, ULPA, ElveFlow, NEMA 17 and RGB-D.
</details>
"""

    translated = translator.translate(source, "lt").text

    assert "# SiLA 2 Deployment" in translated
    assert "<!-- artifact:urn:subactor:artifact:sha256:abcd id=artifact-heading-abcd -->" in translated
    assert "| Component | Protokolas |" in translated
    assert "| sensor | ROS 2 |" in translated
    assert "<!-- artifact:urn:subactor:artifact:sha256:efgh id=artifact-code-efgh -->" in translated
    assert "```bash\npython -m sila2.server\n```" in translated
    assert "python -m sila2.server" in translated
    assert "## OpenTwins Control" in translated
    assert "ChemOS 2.0 valdo biofoundry dark-factory." in translated
    assert "SiLA client links ROS data." in translated
    assert "sila_ros remains stable." in translated
    assert "≈0,5 m" in translated and "≈6000 EUR" in translated and "≈3 850–7 800" in translated
    assert "Laminar Flow Hood" in translated
    assert "![Reconstructed diagram](study.lt.artifacts/diagrams/a/diagram.svg)" in translated
    assert "<details>" in translated
    assert "</details>" in translated
    assert "[Report](reports/source.md)" in translated
    assert "`sila_base`" in translated
    for term in ("GLS80", "HEPA", "ULPA", "ElveFlow", "NEMA 17", "RGB-D"):
        assert term in translated


def test_translation_repairs_known_nmt_corruptions_and_reports_rules() -> None:
    from f2md.translate import _repair_translation

    repaired, rules = _repair_translation(
        "Laminar flow food; SmithKline 3 850-7 800; PLN 6000 EUR; "
        "reach .0,5 m; sila _ base"
    )
    assert repaired == "Laminar flow hood; ≈3 850–7 800; ≈6000 EUR; reach ≈0,5 m; sila_base"
    assert rules == ("LAMINAR_FLOW_HOOD", "APPROX_RANGE", "APPROX_PRICE", "APPROX_REACH", "SILA_BASE")


def test_pass_through_quality_derives_pages_from_source_page_anchors(tmp_path) -> None:
    from f2md.quality import normalize_document

    source = tmp_path / "study.pdf"
    source.write_bytes(b"pdf")
    markdown = """<!-- source-page:1 -->

# One

First page.

<!-- source-page:2 -->

## Two

Second page.
"""

    artifacts = normalize_document(markdown, str(source), normalize=False)

    assert [page["number"] for page in artifacts.structure["pages"]] == [1, 2]
    assert artifacts.quality["metrics"]["pages"] == 2
    assert {block["page"] for block in artifacts.structure["blocks"]} == {1, 2}


def test_markdown_quality_rejects_malformed_image_syntax(tmp_path) -> None:
    source = tmp_path / "study.pdf"
    source.write_bytes(b"pdf")
    artifacts = normalize_document(
        "# Diagram\n\n! Restructured Domain] (assets/diagram.svg)\n",
        str(source),
        normalize=False,
    )
    check = next(item for item in artifacts.quality["checks"] if item["id"] == "MARKDOWN_IMAGE_SYNTAX")
    assert check["status"] == "fail"
    assert artifacts.quality["status"] == "degraded"


def test_markdown_quality_does_not_parse_code_as_headings_or_tables(tmp_path) -> None:
    source = tmp_path / "study.pdf"
    source.write_bytes(b"pdf")
    artifacts = normalize_document(
        "# Integration\n\n```text\n# shell comment\n| diagram node |\n```\n",
        str(source),
        normalize=False,
    )
    checks = {item["id"]: item["status"] for item in artifacts.quality["checks"]}
    assert checks["HEADING_TREE"] == "pass"
    assert checks["TABLE_ORPHAN_CELL"] == "pass"


def test_pdf_layout_classifies_split_code_continuations_without_monospace_fonts() -> None:
    from f2md.pdf_layout import _code_language

    assert _code_language("# Atrado SiLA serverius\nclients = SilaClient.discover(timeout=5)") == "python"
    assert _code_language("dt.add_stream(") == "python"
    assert _code_language('source=oscar.CurrentPosition,\ntarget="Twin.Position"\n)') == "python"
    assert _code_language("# Sukurkite naują paketą\nsila-codegen new-package \\") == "bash"
    assert _code_language("--package-name biofoundry_oscar \\\n--feature-files ./OscarControl.sila.xml") == "bash"
    assert _code_language("biofoundry_oscar/\nserver.py\npyproject.toml") == "text-tree"


def test_hosted_llm_contract_uses_schema_gbnf_and_hash_bound_patchdsl() -> None:
    from f2md.llm_patch import apply_patch_envelope, base_hash, patch_messages

    base = {"text": "Dzień dobry"}
    messages = patch_messages("markdown-translation", {"target": "en"}, base, ["text"], {"type": "object"})
    assert "TARGET_SCHEMA_JSON" in messages[0]["content"]
    assert "PATCH_ENVELOPE_SCHEMA_JSON" in messages[0]["content"]
    assert "PATCH_GBNF" in messages[0]["content"]
    patch_dsl = "\n".join([
        'PATCHDSL "subactor.patch-dsl/v1"',
        'TARGET "markdown-translation"',
        f'BASE_SHA256 "{base_hash(base)}"',
        'SET "/text" "Good morning"',
        "END_PATCH",
    ])
    assert apply_patch_envelope({"schema": "subactor.patch-envelope/v1", "patchDsl": patch_dsl}, "markdown-translation", base, ["text"])["text"] == "Good morning"
    with pytest.raises(ValueError, match="PATCH_PATH_FORBIDDEN"):
        apply_patch_envelope({"schema": "subactor.patch-envelope/v1", "patchDsl": patch_dsl.replace('/text', '/publish')}, "markdown-translation", base, ["text"])


def test_tree_names_originals_by_language_and_keeps_target_unsuffixed(tmp_path) -> None:
    pytest.importorskip("py3langid")
    src = tmp_path / "src"
    src.mkdir()
    (src / "lt.md").write_text(
        "# Bendradarbiavimo sutartis\n\nSi sutartis sudaryta tarp Saptera UAB ir instituto. "
        "Salys susitaria del bendradarbiavimo industrines doktoranturos srityje.\n",
        encoding="utf-8",
    )
    out = tmp_path / "out"
    # No engine is reachable in the test environment; the run must still produce the original and
    # record the gap rather than failing.
    result = convert_tree(str(src), str(out), translate_to="en", translation_policy="openrouter")
    assert result.by_language.get("lt") == 1
    assert (out / "lt.md.lt.md").is_file(), sorted(p.name for p in out.iterdir())
    text = (out / "lt.md.lt.md").read_text(encoding="utf-8")
    assert 'language: "lt"' in text
    assert "translationError" in text, "a missing engine must be recorded, not silently dropped"


def test_tree_does_not_suffix_documents_already_in_the_target_language(tmp_path) -> None:
    pytest.importorskip("py3langid")
    src = tmp_path / "src"
    src.mkdir()
    (src / "en.md").write_text(
        "# Laboratory automation\n\nThis document describes digital twins and robotic platforms "
        "used for high throughput screening in modern laboratories.\n",
        encoding="utf-8",
    )
    out = tmp_path / "out"
    result = convert_tree(str(src), str(out), translate_to="en")
    assert result.translated == 0
    assert (out / "en.md.md").is_file()
    assert not list(out.glob("*.en.md")), "the target language stays unsuffixed"


def test_language_is_not_detected_for_code_and_data(tmp_path) -> None:
    """A CAD parameter file reads as Dutch to a language detector.

    Acting on that would suffix the output with a wrong language and hand structured data to a
    translator, so detection is skipped for non-prose formats entirely.
    """
    pytest.importorskip("py3langid")
    src = tmp_path / "src"
    src.mkdir()
    (src / "thread.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<ThreadType>\n  <Name>PG Conduit Thread</Name>\n'
        "  <Unit>mm</Unit>\n  <Designation>PG7</Designation>\n  <Pitch>1.270</Pitch>\n</ThreadType>\n",
        encoding="utf-8",
    )
    out = tmp_path / "out"
    convert_tree(str(src), str(out), translate_to="en")
    assert (out / "thread.xml.md").is_file(), sorted(p.name for p in out.iterdir())
    assert not list(out.glob("*.nl.md")) and not list(out.glob("*.*.*.md"))
    assert 'language: "unknown"' in (out / "thread.xml.md").read_text(encoding="utf-8")
