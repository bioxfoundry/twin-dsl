---
schema: bioxfoundry.error-page/v1
code: SPEC_MARKDOWN_QUALITY_DEGRADED
source: error/catalog.json
generated: true
---

# SPEC_MARKDOWN_QUALITY_DEGRADED — Spec markdown quality degraded

- Subsystem: `spec`
- Severity: `warning`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The translated Markdown is usable but one or more deterministic quality checks remain warnings.

## Likely causes

- the source extractor reported a reconstructed or uncertain artifact
- a non-blocking structure check such as TOC normalization remains incomplete

## Impact

The document remains addressable, but must not be described as fully verified evidence.

## Resolution

Open the adjacent .quality.mdqldsl file, resolve each WARN check, then regenerate Markdown and intentDSL.

## Emitted by

- `src/runtime/specification-dsl-validation.ts`
