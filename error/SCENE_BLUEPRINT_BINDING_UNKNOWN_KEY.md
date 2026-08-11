---
schema: bioxfoundry.error-page/v1
code: SCENE_BLUEPRINT_BINDING_UNKNOWN_KEY
source: error/catalog.json
generated: true
---

# SCENE_BLUEPRINT_BINDING_UNKNOWN_KEY — Scene blueprint binding unknown key

- Subsystem: `scene blueprint`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The scene blueprint binding input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `src/scene/blueprint.ts`
