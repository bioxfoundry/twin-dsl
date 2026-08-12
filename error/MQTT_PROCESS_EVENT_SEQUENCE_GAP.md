---
schema: bioxfoundry.error-page/v1
code: MQTT_PROCESS_EVENT_SEQUENCE_GAP
source: error/catalog.json
generated: true
---

# MQTT_PROCESS_EVENT_SEQUENCE_GAP — MQTT process event sequence gap

- Subsystem: `mqtt`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

A URI Process run skipped one or more monotonically increasing sequence numbers, so the dashboard cannot prove which state or step transitions occurred.

## Likely causes

- the publisher started in the middle of a run or lost its durable counter
- messages were lost upstream or multiple publishers reused one runId

## Impact

The message is recorded as rejected and the previous projected run remains active; the run is never presented as complete.

## Resolution

Replay the missing event(s) in order with the same run identity, or start a new runId at sequence 1 with state PLANNED. Do not renumber an already accepted run.

## Emitted by

- `src/runtime/uri-process-run.ts`
