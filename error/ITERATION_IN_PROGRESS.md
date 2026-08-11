---
schema: bioxfoundry.error-page/v1
code: ITERATION_IN_PROGRESS
source: error/catalog.json
generated: true
---

# ITERATION_IN_PROGRESS — Iteration in progress

- Subsystem: `iteration`
- Severity: `error`
- Error class: `state`
- Retryable: `true`
- Surfaces: `response`

## Meaning

The iteration operation cannot proceed in the current bounded runtime state.

## Likely causes

- another writer or operation is active
- a configured size, time or concurrency budget was reached

## Impact

The current request is delayed or refused without replacing accepted state.

## Resolution

Wait for the active operation to finish or reduce the bounded input; change limits only through an explicit reviewed configuration.

## Emitted by

- `src/serve/dashboard.ts`
