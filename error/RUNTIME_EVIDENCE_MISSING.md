---
schema: bioxfoundry.error-page/v1
code: RUNTIME_EVIDENCE_MISSING
source: error/catalog.json
generated: true
---

# RUNTIME_EVIDENCE_MISSING — Runtime evidence missing

- Subsystem: `runtime`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The runtime evidence input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `src/runtime/project-integrity.ts`
