---
schema: bioxfoundry.error-page/v1
code: ITERATION_BLOCKED
source: error/catalog.json
generated: true
---

# ITERATION_BLOCKED — Iteration blocked

- Subsystem: `iteration`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `response`

## Meaning

The runtime stopped because it detected the iteration blocked condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/serve/dashboard.ts`
