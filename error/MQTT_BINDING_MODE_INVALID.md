---
schema: bioxfoundry.error-page/v1
code: MQTT_BINDING_MODE_INVALID
source: error/catalog.json
generated: true
---

# MQTT_BINDING_MODE_INVALID — Mqtt binding mode invalid

- Subsystem: `mqtt`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The mqtt binding mode input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `src/dsl/mqtt-binding.ts`
