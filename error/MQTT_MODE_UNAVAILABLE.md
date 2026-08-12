---
schema: bioxfoundry.error-page/v1
code: MQTT_MODE_UNAVAILABLE
source: error/catalog.json
generated: true
---

# MQTT_MODE_UNAVAILABLE — MQTT source mode unavailable

- Subsystem: `mqtt`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The requested simulation, shadow or hardware observation mode has no route in the active MqttBindingDSL.

## Likely causes

- the mode was omitted from every PROCESS_ROUTE MODES list
- the dashboard request names a mode that this project intentionally does not expose

## Impact

The dashboard keeps the previous observation source; it does not emit any MQTT command or change accepted project state.

## Resolution

Select one of /api/state mqtt.availableModes, or explicitly add the mode to the reviewed PROCESS_ROUTE and validate ProjectDSL again.

## Emitted by

- `src/runtime/mqtt-process-controller.ts`
