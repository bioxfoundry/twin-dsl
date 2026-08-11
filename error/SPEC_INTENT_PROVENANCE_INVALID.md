---
schema: bioxfoundry.error-page/v1
code: SPEC_INTENT_PROVENANCE_INVALID
source: error/catalog.json
generated: true
---

# SPEC_INTENT_PROVENANCE_INVALID — Spec intent provenance invalid

- Subsystem: `spec`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

One or more intent records are malformed, duplicated or lack page-level source provenance.

## Likely causes

- the pack was compiled from legacy line-only Markdown without a structure sidecar
- a record has an invalid schema, type, ID, target URI, fragment, page or revision hash

## Impact

The validator cannot trace a Twin assertion back to a stable location in the source PDF.

## Resolution

Regenerate Markdown with source-page anchors and structure JSON, then recompile and validate every t2c.intent/v1 record.

## Emitted by

- `src/runtime/specification-dsl-validation.ts`
