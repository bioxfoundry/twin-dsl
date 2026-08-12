---
schema: bioxfoundry.error-page/v1
code: PROCESS_LABWARE_BINDING_MISSING
source: error/catalog.json
generated: true
---

# PROCESS_LABWARE_BINDING_MISSING — Process labware binding missing

- Subsystem: `process`
- Severity: `info`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

A liquid-handling operation is sourced, but its sample, source well or destination well is not bound to scene labware.

## Likely causes

- the software example demonstrates device commands rather than a reviewed laboratory protocol
- the selected evidence omits labware identifiers and accepted volume ranges

## Impact

The device sequence can be demonstrated graphically but cannot authorize or route a real sample transfer.

## Resolution

Provide a reviewed transfer protocol and bind its labware wells, samples and permitted volumes before real-device execution.

## Emitted by

- `src/runtime/process-model.ts`
