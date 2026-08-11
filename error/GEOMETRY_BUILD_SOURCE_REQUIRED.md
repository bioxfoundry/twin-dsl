---
schema: bioxfoundry.error-page/v1
code: GEOMETRY_BUILD_SOURCE_REQUIRED
source: error/catalog.json
generated: true
---

# GEOMETRY_BUILD_SOURCE_REQUIRED — Geometry build source required

- Subsystem: `geometry build`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The geometry build source input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `src/geometry/build-contract.ts`
