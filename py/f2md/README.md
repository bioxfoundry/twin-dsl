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
f2md --tree docs/ docs-md/       # mirror a whole directory tree
```

## Converting a directory tree

```bash
f2md --tree /data/lab /data/lab-md
f2md --tree /data/lab /data/lab-md --only .pdf,.docx --quiet
f2md --tree /data/lab /data/lab-md --secret-pattern 'konfidencial|strictly confidential'
f2md --tree /data/lab /data/lab-md --translate en
```

`src/a/b/report.pdf` becomes `out/a/b/report.pdf.md`. The original extension is kept before `.md`,
so the output name still says what produced it and two files differing only by extension never
collide. Each file gets YAML front matter carrying the full envelope:

```yaml
---
source: "/data/lab/reports/q3.pdf"
sourceRelative: "reports/q3.pdf"
inputKind: ".pdf"
mediaType: "application/pdf"
converter: "pymupdf4llm"
converterVersion: "1.28.2"
backendType: "python"
ocr: false
fallbackDepth: 2
durationMs: 842
extractedChars: 8123
converted: true
warnings: []
---
```

Files with no text layer — CAD meshes, archives, binaries — still get a Markdown file containing
the front matter and a short stub saying why. Dropping them would leave a tree that silently
disagrees with its source, which is worse than an explicit "nothing to extract here".

### Translating to one language

`--translate en` detects each document's language and, for anything not already in the target,
writes **both** files:

```
Bendradarbiavimo_sutartis.docx.secret.lt.md   original, tagged with its language
Bendradarbiavimo_sutartis.docx.secret.md      English translation
```

The unsuffixed name is always the target language, so a consumer that wants "the English one" can
ignore language codes entirely, while the original stays available and clearly labelled.

Two engines, picked **per document**, not per run:

| policy | confidential documents | everything else |
| --- | --- | --- |
| `hybrid` *(default)* | `argos`, offline | `openrouter`, hosted LLM |
| `argos` | `argos` | `argos` |
| `openrouter` | **refused** | `openrouter` |

This is the point of the feature. Machine translation of a document marked confidential must not
send it to a third party, so `hybrid` keeps those on the offline engine and `openrouter` refuses
them outright rather than silently downgrading — a policy that can leak is not a policy.

```bash
pip install 'f2md[translate]'   # argostranslate + language detection, fully offline
export OPENROUTER_API_KEY=...   # only needed for the hosted half of `hybrid`
```

Argos downloads its own language-pair models on first use (~100-200 MB each). If an engine is
unavailable the original is still written and the gap is recorded as `translationError` in its
front matter — a run never fails because a translator was missing.

Translated files carry `translatedFrom`, `translationEngine`, `translationModel` and `translationOf`,
so it is always clear that the text is machine output and which engine produced it.

### Marking confidential documents

`--secret-pattern REGEX` (case-insensitive) writes matching documents as `<name>.<ext>.secret.md`
and sets `confidential: true` in their front matter, so the restriction is visible without opening
the file and survives tooling that only sees filenames.

There is **no default pattern on purpose.** Guessing confidentiality misfires in both directions:
an academic paper discussing "confidential peer review" is not confidential, while a marking in a
language the heuristic does not know would be missed. You state the rule for your corpus.

## Why another converter

Most tools answer "what does this file say". Ingestion pipelines also need to answer **"where did
this Markdown come from, and which backend produced it"** — otherwise you cannot tell a clean text
extraction from an OCR guess three steps later. Every result is one shape:

| field | meaning |
| --- | --- |
| `markdown` | the converted body |
| `metadata` | source path, size, mtime, extracted character count |
| `assets` | extracted side files, when a backend produces them |
| `converter` | which backend actually ran (`deterministic-text`, `pymupdf4llm`, `pdftotext`, `docling`) |
| `version` | that backend's version, so output changes are traceable |
| `backendType` | `stdlib`, `binary`, `python` or `http` — what the conversion actually costs |
| `inputKind` | detected type, independent of what the filename claims |
| `ocr` | whether this came from optical recognition rather than an embedded text layer |
| `fallbackDepth` | how many backends declined first; a high number means a badly ordered chain |
| `durationMs` | wall-clock cost, for diagnosing a slow pipeline |
| `warnings` | non-fatal quality signals: truncation, lost tables, backend diagnostics |

## The chain

Backends are tried cheapest-first, and each one declines files that are not its job:

```
MarkItDown (markup)      HTML before the text backend, or it would be fenced as code
        ↓
text / source files      stdlib only, no install footprint
        ↓
pymupdf4llm              structured Markdown from PDFs with a text layer; declines scans
        ↓
pdftotext / pandoc       used only if the binary is on PATH
        ↓
MarkItDown (general)     Office, spreadsheets, images
        ↓
Docling over HTTP        layout, tables, OCR — only when DOCLING_URL is set
```

Specialised backends come before general ones, and every optional backend declines when its
library is missing — so the same chain works on a bare install and a fully equipped one.

Declining is a routing signal, not an error. A backend that *was* the right one but genuinely
broke surfaces its own failure rather than the misleading "unsupported format" — a Docling outage
looks like a Docling outage.

## Install footprint

The core is **stdlib-only**. Extras are opt-in:

```bash
pip install f2md                # text and source files
pip install 'f2md[pymupdf]'     # structured PDF extraction
pip install 'f2md[markitdown]'  # Office, HTML, spreadsheets, images
pip install 'f2md[docling]'     # run Docling in-process
pip install 'f2md[all]'         # everything
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
