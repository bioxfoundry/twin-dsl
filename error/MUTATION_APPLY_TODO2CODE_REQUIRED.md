---
schema: bioxfoundry.error-page/v1
code: MUTATION_APPLY_TODO2CODE_REQUIRED
source: error/catalog.json
generated: true
---

# MUTATION_APPLY_TODO2CODE_REQUIRED — Mutation apply todo2code required

- Subsystem: `mutation apply`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The mutation apply todo2code input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `src/runtime/mutation-pipeline.ts`
