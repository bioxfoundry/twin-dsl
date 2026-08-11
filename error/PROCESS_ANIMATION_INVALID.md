---
schema: bioxfoundry.error-page/v1
code: PROCESS_ANIMATION_INVALID
source: error/catalog.json
generated: true
---

# PROCESS_ANIMATION_INVALID — Process animation invalid

- Subsystem: `process`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The process animation input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `src/runtime/process-animation.ts`
