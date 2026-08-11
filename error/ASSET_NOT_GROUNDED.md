---
schema: bioxfoundry.error-page/v1
code: ASSET_NOT_GROUNDED
source: error/catalog.json
generated: true
---

# ASSET_NOT_GROUNDED — Asset not grounded

- Subsystem: `asset`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `diagnostic`, `response`

## Meaning

The asset evidence is internally inconsistent or does not match its bound identity.

## Likely causes

- artifacts from different revisions were combined
- an identity, digest, path or relationship is duplicated or inconsistent

## Impact

The runtime cannot prove that the candidate describes one coherent project state.

## Resolution

Use the detail after the code to locate the conflicting value, restore one canonical source and regenerate dependent artifacts.

## Emitted by

- `src/scene/physical-evidence.ts`
- `src/serve/dashboard.ts`
