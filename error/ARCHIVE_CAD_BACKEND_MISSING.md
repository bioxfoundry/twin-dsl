---
schema: bioxfoundry.error-page/v1
code: ARCHIVE_CAD_BACKEND_MISSING
source: error/catalog.json
generated: true
---

# ARCHIVE_CAD_BACKEND_MISSING — Archive cad backend missing

- Subsystem: `archive`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The archive cad backend input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `js/archive-project-analyzer/src/analyze.ts`
