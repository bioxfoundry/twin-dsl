---
schema: bioxfoundry.error-page/v1
code: TWIN_REQUIRED_COMPONENT_MISSING
source: error/catalog.json
generated: true
---

# TWIN_REQUIRED_COMPONENT_MISSING — Twin required component missing

- Subsystem: `twin`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The twin required component input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `src/runtime/autonomy.ts`
