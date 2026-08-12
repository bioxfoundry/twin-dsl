---
schema: bioxfoundry.error-page/v1
code: DECISION_ADDED
source: error/catalog.json
generated: true
---

# DECISION_ADDED — Decision added

- Subsystem: `decision`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the decision added condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/runtime/analysis-trace.ts`
