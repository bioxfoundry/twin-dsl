---
schema: bioxfoundry.error-page/v1
code: SPEC_MARKDOWN_CONTENT_HASH_MISMATCH
source: error/catalog.json
generated: true
---

# SPEC_MARKDOWN_CONTENT_HASH_MISMATCH — Spec markdown content hash mismatch

- Subsystem: `spec`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The spec markdown content evidence is internally inconsistent or does not match its bound identity.

## Likely causes

- artifacts from different revisions were combined
- an identity, digest, path or relationship is duplicated or inconsistent

## Impact

The runtime cannot prove that the candidate describes one coherent project state.

## Resolution

Use the detail after the code to locate the conflicting value, restore one canonical source and regenerate dependent artifacts.

## Emitted by

- `src/runtime/specification-dsl-validation.ts`
