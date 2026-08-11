---
schema: bioxfoundry.error-page/v1
code: GEOMETRY_BUILD_PARAMETER_INVALID
source: error/catalog.json
generated: true
---

# GEOMETRY_BUILD_PARAMETER_INVALID — Geometry build parameter invalid

- Subsystem: `geometry build`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`, `exception`

## Meaning

The geometry build parameter input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `src/geometry/build-contract.ts`
