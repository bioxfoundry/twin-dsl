---
schema: bioxfoundry.error-page/v1
code: PHYSICAL_EVIDENCE_CONSTRAINT_DISTANCE_REQUIRED
source: error/catalog.json
generated: true
---

# PHYSICAL_EVIDENCE_CONSTRAINT_DISTANCE_REQUIRED — Physical evidence constraint distance required

- Subsystem: `physical evidence`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`, `exception`

## Meaning

The physical evidence constraint distance input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `src/scene/physical-evidence.ts`
