---
schema: bioxfoundry.error-page/v1
code: VENDORED_RUNTIME_IDENTITY_MISMATCH
source: error/catalog.json
generated: true
---

# VENDORED_RUNTIME_IDENTITY_MISMATCH — Vendored runtime identity mismatch

- Subsystem: `vendored`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The vendored runtime identity evidence is internally inconsistent or does not match its bound identity.

## Likely causes

- artifacts from different revisions were combined
- an identity, digest, path or relationship is duplicated or inconsistent

## Impact

The runtime cannot prove that the candidate describes one coherent project state.

## Resolution

Use the detail after the code to locate the conflicting value, restore one canonical source and regenerate dependent artifacts.

## Emitted by

- `scripts/sync-vendored-runtime.mjs`
