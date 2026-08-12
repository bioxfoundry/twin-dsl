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

`src/a/b/report.pdf` becomes an AST-first artifact contract. The original extension is kept so the
output name still says what produced it and two files differing only by extension never collide:

```text
out/a/b/report.pdf.ast.json           canonical f2md.document-ast/v1 SSOT
out/a/b/report.pdf.md                 human/LLM projection of that AST
out/a/b/report.pdf.structure.json     backwards-compatible semantic-block projection
out/a/b/report.pdf.quality.mdqldsl    aggregate Markdown quality gate
out/a/b/report.pdf.artifacts/
  manifest.json                       immutable ArtifactStore index
  artifacts.dsl                       ArtifactDSL identities, URIs and relations
  artifact-tree.dsl                   deterministic treeDSL projection
  artifact-quality.dsl               per-artifact quality evidence
  tables/                             JSON + CSV + Markdown previews
  code/                               typed source files
  figures/ diagrams/ charts/          originals and semantic descriptors
```

Each Markdown file gets YAML front matter carrying the full envelope and links to both sidecars:

```yaml
---
source: "/data/lab/reports/q3.pdf"
sourceRelative: "reports/q3.pdf"
inputKind: ".pdf"
mediaType: "application/pdf"
converter: "pymupdf-layout"
converterVersion: "1.26.3"
backendType: "python"
ocr: false
ocrRequested: false
ocrActuallyUsed: false
ocrEngine: "none"
ocrVersion: "unknown"
ocrLanguages: []
ocrPages: []
fallbackDepth: 2
durationMs: 842
extractedChars: 8123
converted: true
qualityStatus: "pass"
qualityScore: 100
structureArtifact: "q3.pdf.structure.json"
qualityArtifact: "q3.pdf.quality.mdqldsl"
sourceModel: "f2md.document-ast/v1"
documentAstArtifact: "q3.pdf.ast.json"
artifactManifest: "q3.pdf.artifacts/manifest.json"
artifactDsl: "q3.pdf.artifacts/artifacts.dsl"
artifactQualityArtifact: "q3.pdf.artifacts/artifact-quality.dsl"
artifactTreeDsl: "q3.pdf.artifacts/artifact-tree.dsl"
warnings: []
---
```

## f2md-quality-v1

The complete authority, file-contract and regression rules are documented in
[`docs/F2MD_ARTIFACT_PIPELINE.md`](../../docs/F2MD_ARTIFACT_PIPELINE.md).

Python `f2md` is the canonical PDF quality engine. Its native PyMuPDF path does **not** produce
Markdown while recognizing layout. It first builds `f2md.document-ast/v1`, classifies typed
artifacts (`paragraph`, `heading`, `list`, `table`, `figure`, `diagram`, `code`, `equation`,
`chart`), removes repeated page furniture, stitches tables across pages and records every page/bbox.
Only then does `MarkdownRenderer` project the AST. Pipes inside an ASCII diagram therefore never
reach a Markdown table parser, code is fenced from a `CodeArtifact`, and a table exists as a cell
grid before pipe/HTML/image rendering is selected.

`ArtifactStore` persists tables as JSON/CSV, code as language-specific files and figures/diagrams
as original crops plus descriptors. Source-backed ASCII diagrams additionally produce validated
graph JSON, DiagramDSL, Mermaid and SVG; every node label must occur in the transcription and every
edge must terminate at known nodes. The graph stores the exact transcription SHA-256, and all
renderers fail closed when that hash or graph provenance is stale. Stable IDs and URNs are derived
from source hash, geometry, type and content. `ArtifactQualityDSL` validates artifacts independently;
`MarkdownQualityDSL` aggregates that result. The older Markdown normalization pass remains an
explicit compatibility adapter for non-layout backends and is never used to reconstruct the
canonical PDF AST.

The native path never runs OCR. A PDF without a usable text layer is declined so Docling or another
explicit OCR backend can own `requested`, `actuallyUsed`, engine, language, pages, regions and
confidence without contradictory provenance.

The converter chain arbitrates document candidates by the versioned quality score. A later backend
can therefore beat an earlier technical success; the selected envelope records every candidate in
`metadata.qualityArbitration`. No LLM participates in conversion or scoring.

`f2md-intent` is fail-closed at this boundary: generated `DEGRADED` and `FAILED` Markdown is excluded
by default, and a structure sidecar limits compilation to blocks with `semantic=true`. A reviewed
candidate can be inspected with `--allow-degraded`; `FAILED` is never admitted by that switch.

Files with no text layer — CAD meshes, archives, binaries — still get a Markdown file containing
the front matter and a short stub saying why. Dropping them would leave a tree that silently
disagrees with its source, which is worse than an explicit "nothing to extract here".

Each successful tree conversion also writes `out/VERSION`. It is a deterministic, line-oriented
manifest with the f2md version plus SHA-256 snapshots of the complete source tree and generated
Markdown/structure/quality/figure artifacts. It deliberately contains no timestamp, absolute path,
credential or machine-specific value, so it can be committed and compared across runs.

For a corpus with `ARCHIVE_EXTRACTION_MANIFEST.json`, "complete source tree" means the logical
source set: pre-existing directories plus archive files, excluding newly materialized targets,
nested `*.extracted` trees and extraction bookkeeping. Files inside those materializations enter
through `--manifest selection.json`, which validates their exact relative paths and SHA-256 hashes.

The same run writes `source-coverage.json` and `source-coverage.dsl`. Every discovered source has
exactly one terminal state: `converted`, `binary-provenance`, `excluded-by-policy`, `unsupported`,
`quarantined` or `failed`. A filtered `--only` input is therefore recorded rather than disappearing.
Records carry the logical path, source hash, derived Markdown path, resource URI, converter identity,
TreeDSL references and an explicit `not-evaluated|included|excluded` Twin-revision status. Repeating
an unchanged conversion leaves both coverage files byte-identical and returns
`coverageNoChange: true` in the tree result.

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
| `converter` | which backend actually ran (`deterministic-text`, `pymupdf-layout`, `pdftotext`, `docling`) |
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
pymupdf-layout           native PDF geometry → DocumentAST; declines scans
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

PDF, LaTeX and Office support needs `pdftotext` (poppler) and/or `pandoc` on your PATH — no Python
dependency is added for them:

```bash
apt install poppler-utils pandoc     # Debian/Ubuntu
brew install poppler pandoc          # macOS
```

## Content-addressed filenames

Ingestion pipelines rename imports to `report.pdf-9f2c8ad4` or `deck.pptx.part`, which defeats
LaTeX (`.tex`) is converted with Pandoc (`latex` → Markdown) when the binary is available. If
Pandoc is not installed, the deterministic backend deliberately preserves the original source in
a fenced `tex` block. Detection scans the basename instead:

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
