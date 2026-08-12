---
schema: bioxfoundry.error-page/v1
code: MQTT_URL_NOT_CONFIGURED
source: error/catalog.json
generated: true
---

# MQTT_URL_NOT_CONFIGURED — Mqtt url not configured

- Subsystem: `mqtt`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `exception`

## Meaning

The mqtt url dependency or operation was unavailable at the runtime boundary.

## Likely causes

- the service or executable is not running
- configuration, network access or the selected adapter is unavailable

## Impact

The requested stage cannot complete, but persisted accepted artifacts remain unchanged.

## Resolution

Inspect the detail following the code, verify service/tool health and configuration, then retry when the dependency is available.

## Emitted by

- `src/runtime/mqtt-process-controller.ts`
- `src/runtime/mqtt-process-demo.ts`
