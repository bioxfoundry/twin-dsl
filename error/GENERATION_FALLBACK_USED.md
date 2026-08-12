---
schema: bioxfoundry.error-page/v1
code: GENERATION_FALLBACK_USED
source: error/catalog.json
generated: true
---

# GENERATION_FALLBACK_USED — Generation fallback used

- Subsystem: `generation`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The runtime stopped because it detected the generation fallback used condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/runtime/project-integrity.ts`
