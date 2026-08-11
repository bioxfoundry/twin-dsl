---
schema: bioxfoundry.error-page/v1
code: SPEC_SOURCE_DOCUMENT_MISSING
source: error/catalog.json
generated: true
---

# SPEC_SOURCE_DOCUMENT_MISSING — Spec source document missing

- Subsystem: `spec`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The specification source directory is empty or does not contain the canonical Atvirojo kodo biofoundry studija.pdf.

## Likely causes

- the binary corpus was not mounted or checked out
- the specification directory was renamed or the validator received the wrong path
- the canonical study was removed while generated Markdown remained

## Impact

Cached Markdown, intentDSL and Twin output are not accepted as substitutes for the authoritative source evidence.

## Resolution

Restore the original PDF bytes at the path named by the finding; if those bytes legitimately changed, regenerate every dependent artifact before validating again.

## Emitted by

- `src/runtime/specification-dsl-validation.ts`
