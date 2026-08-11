---
schema: bioxfoundry.error-page/v1
code: PROCESS_PARAMETER_DUPLICATE
source: error/catalog.json
generated: true
---

# PROCESS_PARAMETER_DUPLICATE — Process parameter duplicate

- Subsystem: `process`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

One process step defines the same parameter name more than once.

## Likely causes

- two source extractors emitted competing values into one step
- a manual edit appended a parameter instead of replacing the reviewed value

## Impact

The step is rejected because downstream animation or control views could select an arbitrary value.

## Resolution

Use the process and step ids in the detail to retain one source-grounded value per parameter name, then regenerate.

## Emitted by

- `src/dsl/process.ts`
