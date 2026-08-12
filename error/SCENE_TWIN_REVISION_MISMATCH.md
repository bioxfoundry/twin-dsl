---
schema: bioxfoundry.error-page/v1
code: SCENE_TWIN_REVISION_MISMATCH
source: error/catalog.json
generated: true
---

# SCENE_TWIN_REVISION_MISMATCH — Scene twin revision mismatch

- Subsystem: `scene`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The scene twin evidence is internally inconsistent or does not match its bound identity.

## Likely causes

- artifacts from different revisions were combined
- an identity, digest, path or relationship is duplicated or inconsistent

## Impact

The runtime cannot prove that the candidate describes one coherent project state.

## Resolution

Use the detail after the code to locate the conflicting value, restore one canonical source and regenerate dependent artifacts.

## Emitted by

- `src/runtime/project-integrity.ts`
