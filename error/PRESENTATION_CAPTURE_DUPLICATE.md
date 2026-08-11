---
schema: bioxfoundry.error-page/v1
code: PRESENTATION_CAPTURE_DUPLICATE
source: error/catalog.json
generated: true
---

# PRESENTATION_CAPTURE_DUPLICATE — Presentation capture duplicate

- Subsystem: `presentation`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `diagnostic`, `exception`

## Meaning

The presentation capture evidence is internally inconsistent or does not match its bound identity.

## Likely causes

- artifacts from different revisions were combined
- an identity, digest, path or relationship is duplicated or inconsistent

## Impact

The runtime cannot prove that the candidate describes one coherent project state.

## Resolution

Use the detail after the code to locate the conflicting value, restore one canonical source and regenerate dependent artifacts.

## Emitted by

- `src/runtime/presentation-evidence.ts`
