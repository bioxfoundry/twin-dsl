---
schema: bioxfoundry.error-page/v1
code: MUTATION_APPLY_SELF_MODIFICATION_DISABLED
source: error/catalog.json
generated: true
---

# MUTATION_APPLY_SELF_MODIFICATION_DISABLED — Mutation apply self modification disabled

- Subsystem: `mutation apply`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the mutation apply self modification disabled condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/runtime/mutation-pipeline.ts`
