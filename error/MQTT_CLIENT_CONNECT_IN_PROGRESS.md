---
schema: bioxfoundry.error-page/v1
code: MQTT_CLIENT_CONNECT_IN_PROGRESS
source: error/catalog.json
generated: true
---

# MQTT_CLIENT_CONNECT_IN_PROGRESS — Mqtt client connect in progress

- Subsystem: `mqtt`
- Severity: `error`
- Error class: `state`
- Retryable: `true`
- Surfaces: `exception`

## Meaning

The mqtt client connect operation cannot proceed in the current bounded runtime state.

## Likely causes

- another writer or operation is active
- a configured size, time or concurrency budget was reached

## Impact

The current request is delayed or refused without replacing accepted state.

## Resolution

Wait for the active operation to finish or reduce the bounded input; change limits only through an explicit reviewed configuration.

## Emitted by

- `src/transport/mqtt.ts`
