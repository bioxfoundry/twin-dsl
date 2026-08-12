---
schema: bioxfoundry.error-page/v1
code: MQTT_DEMO_PROCESS_PATH_EMPTY
source: error/catalog.json
generated: true
---

# MQTT_DEMO_PROCESS_PATH_EMPTY — Mqtt demo process path empty

- Subsystem: `mqtt`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the mqtt demo process path empty condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/runtime/mqtt-process-demo.ts`
