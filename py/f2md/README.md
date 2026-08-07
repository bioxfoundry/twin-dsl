# f2md

Convert any file to a unified Markdown envelope — with provenance, and without a mandatory
dependency tree.

```bash
pip install f2md
```

```python
from f2md import convert

doc = convert("report.pdf")
doc.markdown    # '# report.pdf\n\n…'
doc.converter   # 'pdftotext'
doc.metadata    # {'source': 'report.pdf', 'size': 91234, 'mtime': '…', 'extractedChars': 8123}
```

```bash
f2md notes.md                    # Markdown to stdout
f2md report.pdf --json           # full envelope as JSON
f2md imports/deck.pptx-9f2c      # content-addressed names work too
f2md scan.pdf --backend docling  # force a specific backend
```

## Why another converter

Most tools answer "what does this file say". Ingestion pipelines also need to answer **"where did
this Markdown come from, and which backend produced it"** — otherwise you cannot tell a clean text
extraction from an OCR guess three steps later. Every result is one shape:

| field | meaning |
| --- | --- |
| `markdown` | the converted body |
| `metadata` | source path, size, mtime, extracted character count |
| `assets` | extracted side files, when a backend produces them |
| `converter` | which backend actually ran (`deterministic-text`, `pdftotext`, `pandoc`, `docling`) |
| `version` | that backend's version, so output changes are traceable |

## The chain

Backends are tried cheapest-first, and each one declines files that are not its job:

```
text / source files      stdlib only, no install footprint
        ↓
pdftotext / pandoc       used only if the binary is on PATH
        ↓
Docling over HTTP        only when DOCLING_URL is set
```

Declining is a routing signal, not an error. A backend that *was* the right one but genuinely
broke surfaces its own failure rather than the misleading "unsupported format" — a Docling outage
looks like a Docling outage.

## Install footprint

The core is **stdlib-only**. Extras are opt-in:

```bash
pip install f2md              # text and source files
pip install 'f2md[docling]'   # run Docling in-process
```

PDF and Office support needs `pdftotext` (poppler) and/or `pandoc` on your PATH — no Python
dependency is added for them:

```bash
apt install poppler-utils pandoc     # Debian/Ubuntu
brew install poppler pandoc          # macOS
```

## Content-addressed filenames

Ingestion pipelines rename imports to `report.pdf-9f2c8ad4` or `deck.pptx.part`, which defeats
`os.path.splitext`. Detection scans the basename instead:

```python
from f2md import detect_document_kind, media_type_for

detect_document_kind("imports/report.pdf-9f2c8ad4")  # '.pdf'
media_type_for("imports/report.pdf-9f2c8ad4")        # 'application/pdf'
```

## Building your own chain

```python
from f2md import ConverterChain, TextConverter, LocalToolConverter, DoclingHttpConverter

chain = ConverterChain([
    TextConverter(max_chars=50_000),
    LocalToolConverter(timeout_s=30),
    DoclingHttpConverter("http://docling:5001"),
])
doc = chain.convert("scan.pdf")
```

A converter is anything with a `name` and a `convert(path) -> ConvertedDocument` method. Raise
`ExternalConverterRequired(kind)` to pass the file down the chain, or `ConversionError` to report a
real failure.

## Environment

| variable | default | purpose |
| --- | --- | --- |
| `DOCLING_URL` | *(unset)* | adds the Docling backend to the default chain |
| `F2MD_MAX_CHARS` | `400000` | truncation limit for extracted text |
| `F2MD_TIMEOUT_S` | `120` | timeout for `pdftotext` / `pandoc` |

## JavaScript

The same contract ships as `@subactor/f2md` on npm, producing an identical envelope so both sides
of a pipeline agree on provenance.

## License

Apache-2.0
