# @subactor/f2md

Convert any file to a unified Markdown envelope — with provenance, and with **zero runtime
dependencies**.

```bash
npm install @subactor/f2md
```

```ts
import { convert } from "@subactor/f2md";

const doc = await convert("report.pdf");
doc.markdown;   // '# report.pdf\n\n…'
doc.converter;  // 'pdftotext'
doc.metadata;   // { source: 'report.pdf', size: 91234, mtime: '…', extractedChars: 8123 }
```

```bash
npx f2md notes.md                    # Markdown to stdout
npx f2md report.pdf --json           # full envelope as JSON
npx f2md imports/deck.pptx-9f2c      # content-addressed names work too
npx f2md scan.pdf --backend docling  # force a specific backend
npx f2md --tree source/ source-md/   # writes source-md/VERSION as well as Markdown
```

Tree conversion writes a deterministic `VERSION` manifest beside the Markdown mirror. It records
the Node f2md version and SHA-256 snapshots of the input tree and generated Markdown only; it has
no timestamp, absolute path or secret, so the same conversion has the same version everywhere.

It also writes the versioned `source-coverage.json` and `source-coverage.dsl` file contract. Every
discovered input receives exactly one terminal state (`converted`, `binary-provenance`,
`excluded-by-policy`, `unsupported`, `quarantined` or `failed`), including files omitted by
`--only`. The JSON/DSL bytes are stable across unchanged runs; `TreeResult.coverageNoChange`
reports whether the exact snapshot already existed.

## Why another converter

Most tools answer "what does this file say". Ingestion pipelines also need to answer **"where did
this Markdown come from, and which backend produced it"** — otherwise you cannot tell a clean text
extraction from an OCR guess three steps later. Every result is one shape:

| field | meaning |
| --- | --- |
| `markdown` | the converted body |
| `metadata` | source path, size, mtime, extracted character count |
| `assets` | extracted side files, when a backend produces them |
| `converter` | which backend actually ran (`deterministic-text`, `turndown`, `pdftotext`, `docling`) |
| `version` | that backend's version, so output changes are traceable |
| `backendType` | `stdlib`, `binary`, `node` or `http` — what the conversion actually costs |
| `inputKind` | detected type, independent of what the filename claims |
| `ocr` | whether this came from optical recognition rather than an embedded text layer |
| `fallbackDepth` | how many backends declined first; a high number means a badly ordered chain |
| `durationMs` | wall-clock cost, for diagnosing a slow pipeline |
| `warnings` | non-fatal quality signals: truncation, lost styles, backend diagnostics |

## The chain

Backends are tried cheapest-first, and each one declines files that are not its job:

```
turndown (HTML)          before the text backend, or HTML would be fenced as code
        ↓
mammoth -> turndown      DOCX via semantic HTML
        ↓
text / source files      no dependencies, no external process
        ↓
pdftotext / pandoc       used only if the binary is on PATH; Pandoc handles `.tex` as LaTeX
        ↓
Docling over HTTP        layout, tables, OCR — only when DOCLING_URL is set
```

Every optional backend declines when its peer dependency is absent, so the same chain works on a
bare install and a fully equipped one.

Declining is a routing signal, not an error. A backend that *was* the right one but genuinely
broke surfaces its own failure rather than the misleading "unsupported format" — a Docling outage
looks like a Docling outage.

## Install footprint

Nothing is installed beyond this package. Node backends are **optional peer dependencies** — add
them only if you want them:

```bash
npm install turndown          # HTML -> Markdown
npm install mammoth turndown  # DOCX -> HTML -> Markdown
```

Mammoth's own Markdown output is deprecated upstream, so the supported path is DOCX -> semantic
HTML -> Turndown, which also keeps the HTML conversion rules in one place.

PDF and Office support uses binaries if they happen to be on your PATH:

```bash
apt install poppler-utils pandoc     # Debian/Ubuntu
brew install poppler pandoc          # macOS
```

A missing binary is treated as "not my job", so the chain falls through instead of throwing.

## Content-addressed filenames

Ingestion pipelines rename imports to `report.pdf-9f2c8ad4` or `deck.pptx.part`, which defeats
`path.extname`. Detection scans the basename instead:

```ts
import { detectDocumentKind, mediaTypeFor } from "@subactor/f2md";

detectDocumentKind("imports/report.pdf-9f2c8ad4"); // '.pdf'
mediaTypeFor("imports/report.pdf-9f2c8ad4");       // 'application/pdf'
```

## Building your own chain

```ts
import { ConverterChain, TextConverter, LocalToolConverter, DoclingHttpConverter } from "@subactor/f2md";

const chain = new ConverterChain([
  new TextConverter(50_000),
  new LocalToolConverter(400_000, 30_000),
  new DoclingHttpConverter("http://docling:5001"),
]);
const doc = await chain.convert("scan.pdf");
```

A converter is anything with a `name` and `convert(path): Promise<ConvertedDocument>`. Throw
`ExternalConverterRequired(kind)` to pass the file down the chain, or `ConversionError` to report a
real failure.

## Environment

| variable | default | purpose |
| --- | --- | --- |
| `DOCLING_URL` | *(unset)* | adds the Docling backend to the default chain |
| `F2MD_MAX_CHARS` | `400000` | truncation limit for extracted text |
| `F2MD_TIMEOUT_MS` | `120000` | timeout for `pdftotext` / `pandoc` |

## Python

The same contract ships as [`f2md`](https://pypi.org/project/f2md/) on PyPI, producing an identical
envelope so both sides of a pipeline agree on provenance.

For PDF, Office and image inputs, the default Node chain first invokes `python3 -m f2md.cli` as the
canonical `f2md-quality-v1` engine. This is an optional file-contract bridge, not an npm runtime
dependency: if Python or the module is absent, the converter declines and the existing
Mammoth/pdftotext/Pandoc/Docling fallbacks continue. Set `F2MD_PYTHON` to another interpreter path,
or to `disabled` to skip the bridge explicitly. Canonical Python results retain their
`documentAst`, `conversionQuality`, block structure and OCR audit inside `metadata`. In Node tree
mode the output path is passed back to Python so the Python-owned ArtifactStore (original figure
crops, table/code sidecars, manifest, ArtifactDSL, ArtifactQualityDSL and treeDSL) is materialized
without reimplementing PDF heuristics in TypeScript. TypeScript only validates the envelope and
persists the returned file contract.

## Requirements

Node.js >= 18 (uses built-in `fetch`, `FormData` and `AbortSignal.timeout`).

## License

Apache-2.0
