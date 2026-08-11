---
schema: bioxfoundry.error-page/v1
code: TWIN_SOURCE_SNAPSHOT_OVERRIDE
source: error/catalog.json
generated: true
---

# TWIN_SOURCE_SNAPSHOT_OVERRIDE — Twin source snapshot override

- Subsystem: `twin`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the twin source snapshot override condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/runtime/autonomy.ts`
