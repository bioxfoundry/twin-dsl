# f2md typed-artifact pipeline

## Authority boundary

For a PDF with a native text layer, `f2md.document-ast/v1` is the canonical conversion result.
Markdown, semantic block JSON, ArtifactDSL, treeDSL and both quality DSLs are deterministic
projections. No consumer may parse Markdown to reconstruct a table, diagram, code block or figure
when the DocumentAST sidecar is present.

```text
PDF
  -> PyMuPDF native layout (text spans, words, images, drawings, page geometry)
  -> repeated header/footer and page-number exclusion
  -> classifier (ASCII before table; code before prose)
  -> typed artifacts and page/bbox provenance
  -> table/header continuation and cross-page stitching
  -> f2md.document-ast/v1
  -> immutable ArtifactStore
  -> Markdown + semantic structure + ArtifactDSL + treeDSL + quality DSLs
```

The native extractor never invokes OCR. A scan is declined, allowing an explicit Docling/OCR
backend to record requested/actual engine use, pages, regions, languages and confidence. The
Markdown normalizer remains a compatibility adapter for backends that cannot supply layout; it is
not allowed to masquerade as the AST-first path.

## File contract

For `report.pdf.md`, the Python tree converter writes:

```text
source-coverage.json
source-coverage.dsl
report.pdf.ast.json
report.pdf.md
report.pdf.structure.json
report.pdf.quality.mdqldsl
report.pdf.artifacts/
  manifest.json
  artifacts.dsl
  artifact-tree.dsl
  artifact-quality.dsl
  tables/<artifact-id>/{table.json,table.csv,table.md}
  code/<artifact-id>/source.<language-extension>
  figures/<artifact-id>/{figure.json,original.*}
  diagrams/<artifact-id>/{graph.json,diagram.txt,diagram.dsl,diagram.mmd,diagram.svg,original.*}
  charts/<artifact-id>/{chart.json,original.*}
```

Coverage is a corpus-level terminal-state ledger. Every discovered source appears exactly once as
`converted`, `binary-provenance`, `excluded-by-policy`, `unsupported`, `quarantined` or `failed`.
The report contains no timestamp or absolute root, is hash-bound and remains byte-identical on an
unchanged rerun. `twin-dsl` validates and consumes this file; it does not infer coverage again from
the set of Markdown files that happened to exist.

Artifact IDs and URNs bind the source SHA-256, type, pages, bbox and normalized content. The
manifest covers every AST artifact, hashes inline content, every primary projection and every
additional derivative (including table CSV), and records all materialized URIs. The auditor rejects
source drift, AST/structure disagreement, missing entries, path escape, missing files and hash
drift in content, preview, original or additional derivative bytes.

For a deliberately selected subset of an unpacked archive, both Node and Python converters accept
the same `bioxfoundry.source-selection/v1` manifest. Every entry carries an exact relative path,
source SHA-256 and expected use. The manifest is validated before conversion and selection never
falls back to scanning the rest of the tree. Protobuf (`.proto`) is treated as deterministic text,
so SiLA service definitions preserve their callable methods and streaming response contracts.

## Deterministic classification

- Repeated blocks in page margins are excluded from semantic artifacts; page numbers are retained
  only as source-page anchors in rendered Markdown.
- ASCII box/tree/arrow signals are evaluated before borderless-table detection, so `|` is never
  sufficient to create a table.
- Borderless tables use native PDF line identities and x anchors. Header continuations are merged,
  repeated headers are removed and compatible bottom/top fragments become one cross-page artifact.
- Code uses native monospace evidence plus deterministic language signatures. Proportional prose
  containing colon-ended labels is not YAML.
- Embedded images and vector regions retain page/bbox and an original crop. ASCII diagrams receive
  a deterministic graph only when every node label occurs in the source transcription and every
  edge endpoint resolves to a known node. `graph.json` validates as `f2md.diagram-graph/v1` and
  carries the SHA-256 of the exact source transcription; renderers refuse stale or malformed graphs.
  The graph projects to DiagramDSL, Mermaid and SVG while the original crop remains separately
  hash-bound. Missing topology produces `DEGRADED` rather than invented structure; no LLM
  participates in reconstruction.
- Table-like contents pages become structured navigation-list artifacts instead of pipe tables.

## Downstream policy

`f2md-intent` reads only blocks with `semantic=true`, carries artifact IDs/URNs in source
provenance and rejects `DEGRADED` unless `--allow-degraded` is explicit. `artifact-tree.dsl`
projects deterministic `PART_OF` relations between typed artifacts and their nearest section.
The same classifier emits conservative typed edges: tables `DESCRIBES`, visual artifacts
`DEPICTS`, and code `IMPLEMENTS` that section; these edges never depend on an LLM.
An LLM may later propose a graph/table repair only through the repository's validated patchDSL
boundary; conversion, classification, quality status and publication never depend on it.

## Regression contract

`fixtures/pdf-quality/atvirojo-artifact-invariants.json` pins the real Lithuanian study by SHA-256.
When that external corpus file is available, tests prove that:

- BIO-SPEC ASCII on page 14 is a diagram and not a table;
- the OpenTwins architecture on page 26 remains a diagram;
- the microscopy BOM is one table across pages 14–15;
- the aggregate BOM is one table across pages 16–17;
- SiLA examples retain Python, XML, Bash and systemd types;
- repeated page furniture does not enter visible Markdown.

The binary PDF is deliberately not copied into this repository.
