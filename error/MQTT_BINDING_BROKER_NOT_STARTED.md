---
schema: bioxfoundry.error-page/v1
code: MQTT_BINDING_BROKER_NOT_STARTED
source: error/catalog.json
generated: true
---

# MQTT_BINDING_BROKER_NOT_STARTED — Mqtt binding broker not started

- Subsystem: `mqtt`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the mqtt binding broker not started condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/dsl/mqtt-binding.ts`
