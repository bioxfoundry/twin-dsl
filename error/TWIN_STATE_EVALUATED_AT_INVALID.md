---
schema: bioxfoundry.error-page/v1
code: TWIN_STATE_EVALUATED_AT_INVALID
source: error/catalog.json
generated: true
---

# TWIN_STATE_EVALUATED_AT_INVALID — Twin state evaluated at invalid

- Subsystem: `twin`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The twin state evaluated at input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `js/live-twin-state/src/projector.ts`
