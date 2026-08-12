---
schema: bioxfoundry.error-page/v1
code: MQTT_BINDING_TOPIC_DUPLICATE
source: error/catalog.json
generated: true
---

# MQTT_BINDING_TOPIC_DUPLICATE — Mqtt binding topic duplicate

- Subsystem: `mqtt`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The mqtt binding topic evidence is internally inconsistent or does not match its bound identity.

## Likely causes

- artifacts from different revisions were combined
- an identity, digest, path or relationship is duplicated or inconsistent

## Impact

The runtime cannot prove that the candidate describes one coherent project state.

## Resolution

Use the detail after the code to locate the conflicting value, restore one canonical source and regenerate dependent artifacts.

## Emitted by

- `src/dsl/mqtt-binding.ts`
