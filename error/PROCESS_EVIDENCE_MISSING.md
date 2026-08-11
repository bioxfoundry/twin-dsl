---
schema: bioxfoundry.error-page/v1
code: PROCESS_EVIDENCE_MISSING
source: error/catalog.json
generated: true
---

# PROCESS_EVIDENCE_MISSING — Process evidence missing

- Subsystem: `process`
- Severity: `warning`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The process cannot be described at the requested fidelity because one or more required source facts were not found.

## Likely causes

- the supplied document does not specify the missing step, parameter or relationship
- conversion, OCR or intent extraction omitted the relevant source fragment

## Impact

The process is explicitly partial and the missing behavior is excluded from executable or animated semantics.

## Resolution

Follow the reported gap to the binary source and Markdown mirror, improve deterministic extraction if evidence exists, or add the missing reviewed material.

## Emitted by

- `src/runtime/process-model.ts`
