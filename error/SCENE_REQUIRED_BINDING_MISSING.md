---
schema: bioxfoundry.error-page/v1
code: SCENE_REQUIRED_BINDING_MISSING
source: error/catalog.json
generated: true
---

# SCENE_REQUIRED_BINDING_MISSING — Scene required binding missing

- Subsystem: `scene`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The scene required binding input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `src/runtime/autonomy.ts`
