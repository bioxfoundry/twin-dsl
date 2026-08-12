---
schema: bioxfoundry.error-page/v1
code: DEVELOPMENT_EVIDENCE_NOT_ACCEPTED
source: error/catalog.json
generated: true
---

# DEVELOPMENT_EVIDENCE_NOT_ACCEPTED — Development evidence not accepted

- Subsystem: `development`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The runtime stopped because it detected the development evidence not accepted condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/runtime/project-integrity.ts`
