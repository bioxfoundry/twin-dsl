---
schema: bioxfoundry.error-page/v1
code: T2C_INTENT_ARRAY_REQUIRED
source: error/catalog.json
generated: true
---

# T2C_INTENT_ARRAY_REQUIRED — T2c intent array required

- Subsystem: `t2c`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The t2c intent array input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `src/dsl/intent.ts`
