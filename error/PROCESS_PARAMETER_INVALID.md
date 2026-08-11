---
schema: bioxfoundry.error-page/v1
code: PROCESS_PARAMETER_INVALID
source: error/catalog.json
generated: true
---

# PROCESS_PARAMETER_INVALID — Process parameter invalid

- Subsystem: `process`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

A process parameter has an empty name, non-finite or empty value, invalid unit, or a basis other than source.

## Likely causes

- intent extraction emitted an empty or malformed parameter
- an inferred display value was incorrectly placed in the factual ProcessDSL parameter list

## Impact

The candidate is rejected before the invalid value reaches the dashboard or another process consumer.

## Resolution

Correct the parameter to a finite number, boolean or non-empty string, retain its source basis and evidence intent id, then validate again.

## Emitted by

- `src/dsl/process.ts`
