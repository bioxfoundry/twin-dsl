from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from f2md import (
    ConversionError,
    ConverterChain,
    ConvertedDocument,
    DoclingHttpConverter,
    ExternalConverterRequired,
    TextConverter,
    convert,
    convert_to_markdown,
    detect_document_kind,
    media_type_for,
)
from f2md.cli import main


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
    assert set(payload) == {"markdown", "metadata", "assets", "converter", "version"}


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
