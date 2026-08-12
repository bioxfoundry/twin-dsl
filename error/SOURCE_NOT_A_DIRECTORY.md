---
schema: bioxfoundry.error-page/v1
code: SOURCE_NOT_A_DIRECTORY
source: error/catalog.json
generated: true
---

# SOURCE_NOT_A_DIRECTORY — Source not a directory

- Subsystem: `source`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the source not a directory condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `js/f2md/src/tree.ts`
