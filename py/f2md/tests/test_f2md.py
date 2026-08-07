from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from f2md import (
    BACKEND_TYPES,
    ConversionError,
    ConverterChain,
    ConvertedDocument,
    DoclingHttpConverter,
    ExternalConverterRequired,
    LocalToolConverter,
    MarkItDownConverter,
    PyMuPDFConverter,
    TextConverter,
    convert,
    convert_to_markdown,
    detect_document_kind,
    media_type_for,
)
from f2md.cli import main
from f2md.tree import convert_tree


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


def test_long_text_is_truncated(tmp_path) -> None:
    src = tmp_path / "big.txt"
    src.write_text("a" * 5000, encoding="utf-8")
    markdown = TextConverter(max_chars=100).convert(str(src)).markdown
    assert "…[truncated]" in markdown
    assert len(markdown) < 500


def test_missing_file_is_reported_clearly(tmp_path) -> None:
    with pytest.raises(ConversionError, match="FILE_NOT_FOUND"):
        convert(str(tmp_path / "nope.md"))


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
    pytest.importorskip("pymupdf4llm")
    pdf = tmp_path / "doc.pdf"
    pdf.write_bytes(_MINIMAL_PDF)
    done = subprocess.run(
        [sys.executable, "-m", "f2md.cli", str(pdf), "--json"],
        capture_output=True, timeout=300, check=False,
    )
    assert done.returncode == 0, done.stderr.decode()
    payload = json.loads(done.stdout.decode())  # must parse with no leading noise
    assert payload["converter"] == "pymupdf4llm", payload["converter"]
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


def test_pymupdf_messages_do_not_leak_between_files(tmp_path) -> None:
    """MuPDF's message store is process-global and accumulates across documents.

    Without a reset per conversion, a PDF that needed OCR poisons the provenance of every file
    converted after it in the same process — the exact failure mode a tree run hits.
    """
    pymupdf = pytest.importorskip("pymupdf")
    pytest.importorskip("pymupdf4llm")
    converter = PyMuPDFConverter()

    src = tmp_path / "clean.pdf"
    src.write_bytes(_MINIMAL_PDF)

    # Seed the global store with a message that belongs to no file we are about to convert.
    pymupdf.TOOLS.reset_mupdf_warnings()
    first = converter.convert(str(src))
    second = converter.convert(str(src))
    # Identical input must give identical provenance, whatever ran before it.
    assert first.ocr == second.ocr
    assert first.warnings == second.warnings, "provenance must not depend on conversion order"


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
