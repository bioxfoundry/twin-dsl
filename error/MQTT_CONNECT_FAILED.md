---
schema: bioxfoundry.error-page/v1
code: MQTT_CONNECT_FAILED
source: error/catalog.json
generated: true
---

# MQTT_CONNECT_FAILED — MQTT broker connection failed

- Subsystem: `mqtt`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `exception`

## Meaning

The MQTT client could not establish a TCP/TLS session and receive an accepted MQTT 3.1.1 CONNACK.

## Likely causes

- the Mosquitto container is stopped or its host port differs from MQTT_URL
- DNS, firewall, TLS or broker authentication rejected the connection

## Impact

The accepted Twin remains available, but MQTT process observations and live process-driven animation are disconnected.

## Resolution

Run docker compose ps and make service-check, verify MQTT_URL and MQTT_PORT, inspect docker compose logs mqtt, then restart the dashboard after the broker is healthy.

## Emitted by

- `src/transport/mqtt.ts`
