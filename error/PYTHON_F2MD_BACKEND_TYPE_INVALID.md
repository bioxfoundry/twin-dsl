---
schema: bioxfoundry.error-page/v1
code: PYTHON_F2MD_BACKEND_TYPE_INVALID
source: error/catalog.json
generated: true
---

# PYTHON_F2MD_BACKEND_TYPE_INVALID — Python f2md backend type invalid

- Subsystem: `python`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The python f2md backend type input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `js/f2md/src/converters.ts`
