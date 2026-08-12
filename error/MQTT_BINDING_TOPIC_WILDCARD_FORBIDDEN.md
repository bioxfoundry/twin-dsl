---
schema: bioxfoundry.error-page/v1
code: MQTT_BINDING_TOPIC_WILDCARD_FORBIDDEN
source: error/catalog.json
generated: true
---

# MQTT_BINDING_TOPIC_WILDCARD_FORBIDDEN — MQTT binding topic wildcard forbidden

- Subsystem: `mqtt`
- Severity: `error`
- Error class: `policy`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

A MqttBindingDSL route used MQTT '+' or '#' syntax. URI Process routes must expand to exact topics so a message has one deterministic process and source-mode identity.

## Likely causes

- TOPIC contains '+' or '#'
- a broad telemetry subscription was copied into a process route

## Impact

The binding is rejected before the dashboard subscribes, preventing unrelated messages from being interpreted as this process.

## Resolution

Replace the wildcard with an exact topic. Use the single supported {mode} placeholder when simulation, shadow and hardware require separate exact topics.

## Emitted by

- `src/dsl/mqtt-binding.ts`
