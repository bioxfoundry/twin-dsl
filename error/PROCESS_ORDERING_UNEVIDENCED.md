---
schema: bioxfoundry.error-page/v1
code: PROCESS_ORDERING_UNEVIDENCED
source: error/catalog.json
generated: true
---

# PROCESS_ORDERING_UNEVIDENCED — Process ordering unevidenced

- Subsystem: `process`
- Severity: `info`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

Displayed steps are arranged for presentation, but the source does not prove that they form an operational sequence.

## Likely causes

- the source describes functions independently rather than as a protocol
- a process twin is named without explicit transition or ordering evidence

## Impact

The dashboard may illustrate related functions, but the order is labelled presentation-only and cannot drive devices.

## Resolution

Provide an approved ordered protocol with transition evidence; until then keep orderingBasis set to presentation-only.

## Emitted by

- `src/runtime/process-model.ts`
