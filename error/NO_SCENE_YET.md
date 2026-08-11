---
schema: bioxfoundry.error-page/v1
code: NO_SCENE_YET
source: error/catalog.json
generated: true
---

# NO_SCENE_YET — No scene yet

- Subsystem: `no`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `response`

## Meaning

The runtime stopped because it detected the no scene yet condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/serve/dashboard.ts`
