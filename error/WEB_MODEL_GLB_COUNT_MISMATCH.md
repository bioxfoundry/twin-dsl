---
schema: bioxfoundry.error-page/v1
code: WEB_MODEL_GLB_COUNT_MISMATCH
source: error/catalog.json
generated: true
---

# WEB_MODEL_GLB_COUNT_MISMATCH — Web model glb count mismatch

- Subsystem: `web`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The web model glb count evidence is internally inconsistent or does not match its bound identity.

## Likely causes

- artifacts from different revisions were combined
- an identity, digest, path or relationship is duplicated or inconsistent

## Impact

The runtime cannot prove that the candidate describes one coherent project state.

## Resolution

Use the detail after the code to locate the conflicting value, restore one canonical source and regenerate dependent artifacts.

## Emitted by

- `scripts/verify-web-models.mjs`
