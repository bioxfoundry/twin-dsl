---
schema: bioxfoundry.error-page/v1
code: OBSERVATION_LINE_OUTSIDE
source: error/catalog.json
generated: true
---

# OBSERVATION_LINE_OUTSIDE — Observation line outside

- Subsystem: `observation`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the observation line outside condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/dsl/observation.ts`
