---
schema: bioxfoundry.error-page/v1
code: LIVING_PROJECT_LEASE_HELD
source: error/catalog.json
generated: true
---

# LIVING_PROJECT_LEASE_HELD — Living project lease held

- Subsystem: `living project`
- Severity: `error`
- Error class: `state`
- Retryable: `true`
- Surfaces: `exception`

## Meaning

The living project lease held operation cannot proceed in the current bounded runtime state.

## Likely causes

- another writer or operation is active
- a configured size, time or concurrency budget was reached

## Impact

The current request is delayed or refused without replacing accepted state.

## Resolution

Wait for the active operation to finish or reduce the bounded input; change limits only through an explicit reviewed configuration.

## Emitted by

- `src/runtime/autonomy.ts`
