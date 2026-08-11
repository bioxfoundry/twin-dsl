---
schema: bioxfoundry.error-page/v1
code: ERROR_DOCS_DRIFT
source: error/catalog.json
generated: true
---

# ERROR_DOCS_DRIFT — Error docs drift

- Subsystem: `error`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `response`

## Meaning

The runtime stopped because it detected the error docs drift condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `scripts/error-catalog.mjs`
