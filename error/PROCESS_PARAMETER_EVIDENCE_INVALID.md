---
schema: bioxfoundry.error-page/v1
code: PROCESS_PARAMETER_EVIDENCE_INVALID
source: error/catalog.json
generated: true
---

# PROCESS_PARAMETER_EVIDENCE_INVALID — Process parameter evidence invalid

- Subsystem: `process`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

A process parameter cites an intent id that is not attached as evidence to the same step.

## Likely causes

- the parameter was copied from another step without its provenance
- the cited intent was removed during evidence filtering

## Impact

The document is rejected instead of presenting an untraceable setpoint, quantity or duration as source fact.

## Resolution

Attach the cited intent evidence to that step or remove/downgrade the parameter; never substitute an inferred value.

## Emitted by

- `src/dsl/process.ts`
