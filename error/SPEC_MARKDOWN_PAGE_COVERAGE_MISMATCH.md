---
schema: bioxfoundry.error-page/v1
code: SPEC_MARKDOWN_PAGE_COVERAGE_MISMATCH
source: error/catalog.json
generated: true
---

# SPEC_MARKDOWN_PAGE_COVERAGE_MISMATCH — Spec markdown page coverage mismatch

- Subsystem: `spec`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The translated structure does not preserve the same ordered source-page coverage as the native Markdown.

## Likely causes

- source-page comments were removed or merged during translation
- a multipage artifact was rendered without a boundary anchor or a stale sidecar was reused

## Impact

Page-level provenance is incomplete, so intent records cannot be audited against every source page.

## Resolution

Restore the missing source-page boundary, regenerate translated structure and quality files, then recompile intentDSL.

## Emitted by

- `src/runtime/specification-dsl-validation.ts`
