---
schema: bioxfoundry.error-page/v1
code: MQTT_PROCESS_EVENT_TOPIC_MODE_MISMATCH
source: error/catalog.json
generated: true
---

# MQTT_PROCESS_EVENT_TOPIC_MODE_MISMATCH — Mqtt process event topic mode mismatch

- Subsystem: `mqtt`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The mqtt process event topic mode evidence is internally inconsistent or does not match its bound identity.

## Likely causes

- artifacts from different revisions were combined
- an identity, digest, path or relationship is duplicated or inconsistent

## Impact

The runtime cannot prove that the candidate describes one coherent project state.

## Resolution

Use the detail after the code to locate the conflicting value, restore one canonical source and regenerate dependent artifacts.

## Emitted by

- `src/runtime/mqtt-process-controller.ts`
