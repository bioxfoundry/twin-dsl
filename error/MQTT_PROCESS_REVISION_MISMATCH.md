---
schema: bioxfoundry.error-page/v1
code: MQTT_PROCESS_REVISION_MISMATCH
source: error/catalog.json
generated: true
---

# MQTT_PROCESS_REVISION_MISMATCH — MQTT process revision mismatch

- Subsystem: `mqtt`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The event processRevision does not equal the sourceSnapshotHash of the active ProcessDSL document.

## Likely causes

- a simulator or real adapter still publishes events for an older process graph
- the dashboard was iterated while a run based on the previous ProcessDSL revision was active

## Impact

The event cannot select an animation step because the named step graph may have changed; it is rejected without changing the projected run.

## Resolution

Read sourceSnapshotHash from the active process.json, rebuild/restart the publisher against that revision and begin a new runId at sequence 1.

## Emitted by

- `src/runtime/uri-process-run.ts`
