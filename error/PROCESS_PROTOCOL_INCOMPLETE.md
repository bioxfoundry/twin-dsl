---
schema: bioxfoundry.error-page/v1
code: PROCESS_PROTOCOL_INCOMPLETE
source: error/catalog.json
generated: true
---

# PROCESS_PROTOCOL_INCOMPLETE — Process protocol incomplete

- Subsystem: `process`
- Severity: `info`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

A useful source-ordered device workflow is available, but experiment-specific recipe or acceptance facts remain unresolved.

## Likely causes

- the equipment paper intentionally leaves experimental setpoints configurable
- a supporting-information recipe or biological acceptance criterion is not yet represented in intentDSL

## Impact

The process stays partial and its animation remains explanatory; it is not promoted to an executable device protocol.

## Resolution

Ingest and review the named experiment protocol or supporting information, then bind every missing value and criterion to source evidence.

## Emitted by

- `src/runtime/process-model.ts`
