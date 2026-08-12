---
schema: bioxfoundry.error-page/v1
code: PYTHON_F2MD_INVALID_JSON
source: error/catalog.json
generated: true
---

# PYTHON_F2MD_INVALID_JSON — Python f2md invalid json

- Subsystem: `python`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the python f2md invalid json condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `js/f2md/src/converters.ts`
