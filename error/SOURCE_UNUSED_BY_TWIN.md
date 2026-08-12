---
schema: bioxfoundry.error-page/v1
code: SOURCE_UNUSED_BY_TWIN
source: error/catalog.json
generated: true
---

# SOURCE_UNUSED_BY_TWIN — Source unused by twin

- Subsystem: `source`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The runtime stopped because it detected the source unused by twin condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/runtime/project-integrity.ts`
