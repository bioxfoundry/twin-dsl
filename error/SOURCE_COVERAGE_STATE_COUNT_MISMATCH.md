---
schema: bioxfoundry.error-page/v1
code: SOURCE_COVERAGE_STATE_COUNT_MISMATCH
source: error/catalog.json
generated: true
---

# SOURCE_COVERAGE_STATE_COUNT_MISMATCH — Source coverage state count mismatch

- Subsystem: `source coverage`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The source coverage state count evidence is internally inconsistent or does not match its bound identity.

## Likely causes

- artifacts from different revisions were combined
- an identity, digest, path or relationship is duplicated or inconsistent

## Impact

The runtime cannot prove that the candidate describes one coherent project state.

## Resolution

Use the detail after the code to locate the conflicting value, restore one canonical source and regenerate dependent artifacts.

## Emitted by

- `src/runtime/source-coverage.ts`
