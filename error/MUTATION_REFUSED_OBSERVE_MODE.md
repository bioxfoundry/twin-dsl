---
schema: bioxfoundry.error-page/v1
code: MUTATION_REFUSED_OBSERVE_MODE
source: error/catalog.json
generated: true
---

# MUTATION_REFUSED_OBSERVE_MODE — Mutation refused observe mode

- Subsystem: `mutation`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the mutation refused observe mode condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/runtime/mutation-pipeline.ts`
