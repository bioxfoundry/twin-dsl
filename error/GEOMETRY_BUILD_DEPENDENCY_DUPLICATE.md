---
schema: bioxfoundry.error-page/v1
code: GEOMETRY_BUILD_DEPENDENCY_DUPLICATE
source: error/catalog.json
generated: true
---

# GEOMETRY_BUILD_DEPENDENCY_DUPLICATE — Geometry build dependency duplicate

- Subsystem: `geometry build`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `diagnostic`, `exception`

## Meaning

The geometry build dependency evidence is internally inconsistent or does not match its bound identity.

## Likely causes

- artifacts from different revisions were combined
- an identity, digest, path or relationship is duplicated or inconsistent

## Impact

The runtime cannot prove that the candidate describes one coherent project state.

## Resolution

Use the detail after the code to locate the conflicting value, restore one canonical source and regenerate dependent artifacts.

## Emitted by

- `src/geometry/build-contract.ts`
