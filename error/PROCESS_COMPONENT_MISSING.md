---
schema: bioxfoundry.error-page/v1
code: PROCESS_COMPONENT_MISSING
source: error/catalog.json
generated: true
---

# PROCESS_COMPONENT_MISSING — Process component missing

- Subsystem: `process`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

A source-grounded process step references a device or work-area component that is absent from TwinDSL.

## Likely causes

- the source describes equipment not yet represented in TwinDSL
- the component identifier drifted between the process and twin models

## Impact

Process publication and animation stop because the intended actor cannot be bound to a real twin component.

## Resolution

Add the evidenced component to TwinDSL or correct the stale actor id, then regenerate ProcessDSL against the accepted twin.

## Emitted by

- `src/dsl/process.ts`
