---
schema: bioxfoundry.error-page/v1
code: MQTT_PROCESS_MODEL_NOT_AVAILABLE
source: error/catalog.json
generated: true
---

# MQTT_PROCESS_MODEL_NOT_AVAILABLE — Mqtt process model not available

- Subsystem: `mqtt`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `exception`

## Meaning

The mqtt process model dependency or operation was unavailable at the runtime boundary.

## Likely causes

- the service or executable is not running
- configuration, network access or the selected adapter is unavailable

## Impact

The requested stage cannot complete, but persisted accepted artifacts remain unchanged.

## Resolution

Inspect the detail following the code, verify service/tool health and configuration, then retry when the dependency is available.

## Emitted by

- `src/runtime/mqtt-process-controller.ts`
