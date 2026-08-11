---
schema: bioxfoundry.error-page/v1
code: T2C_INTENT_ID_DUPLICATE
source: error/catalog.json
generated: true
---

# T2C_INTENT_ID_DUPLICATE — T2c intent id duplicate

- Subsystem: `t2c`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The t2c intent id evidence is internally inconsistent or does not match its bound identity.

## Likely causes

- artifacts from different revisions were combined
- an identity, digest, path or relationship is duplicated or inconsistent

## Impact

The runtime cannot prove that the candidate describes one coherent project state.

## Resolution

Use the detail after the code to locate the conflicting value, restore one canonical source and regenerate dependent artifacts.

## Emitted by

- `src/dsl/intent.ts`
