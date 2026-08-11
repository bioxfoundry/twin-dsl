---
schema: bioxfoundry.error-page/v1
code: SPEC_MARKDOWN_QUALITY_MISSING
source: error/catalog.json
generated: true
---

# SPEC_MARKDOWN_QUALITY_MISSING — Spec markdown quality missing

- Subsystem: `spec`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The source-language or translated Markdown has no readable .quality.mdqldsl sidecar, so the system cannot prove that conversion quality was evaluated.

## Likely causes

- only the Markdown file was copied from a conversion workspace
- conversion stopped before sidecars were published atomically
- a cleanup step removed generated quality contracts

## Impact

The document and aggregate specification report fail closed even when the Markdown looks readable.

## Resolution

Regenerate the document with f2md so Markdown, structure, AST/artifacts and MarkdownQualityDSL are written together; rebuild intentDSL and validate again.

## Emitted by

- `src/runtime/specification-dsl-validation.ts`
