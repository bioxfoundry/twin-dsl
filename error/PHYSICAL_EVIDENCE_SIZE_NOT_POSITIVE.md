---
schema: bioxfoundry.error-page/v1
code: PHYSICAL_EVIDENCE_SIZE_NOT_POSITIVE
source: error/catalog.json
generated: true
---

# PHYSICAL_EVIDENCE_SIZE_NOT_POSITIVE — Physical evidence size not positive

- Subsystem: `physical evidence`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`, `exception`

## Meaning

The runtime stopped because it detected the physical evidence size not positive condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/scene/physical-evidence.ts`
