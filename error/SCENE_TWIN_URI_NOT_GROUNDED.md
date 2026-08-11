---
schema: bioxfoundry.error-page/v1
code: SCENE_TWIN_URI_NOT_GROUNDED
source: error/catalog.json
generated: true
---

# SCENE_TWIN_URI_NOT_GROUNDED — Scene twin uri not grounded

- Subsystem: `scene`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `diagnostic`, `exception`

## Meaning

The scene twin uri evidence is internally inconsistent or does not match its bound identity.

## Likely causes

- artifacts from different revisions were combined
- an identity, digest, path or relationship is duplicated or inconsistent

## Impact

The runtime cannot prove that the candidate describes one coherent project state.

## Resolution

Use the detail after the code to locate the conflicting value, restore one canonical source and regenerate dependent artifacts.

## Emitted by

- `src/runtime/autonomy.ts`
- `src/scene/physical-evidence.ts`
