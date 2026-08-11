---
schema: bioxfoundry.error-page/v1
code: PRESENTATION_CAPTURE_INVALID
source: error/catalog.json
generated: true
---

# PRESENTATION_CAPTURE_INVALID — Presentation capture invalid

- Subsystem: `presentation`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`, `exception`

## Meaning

The presentation capture input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `src/runtime/presentation-evidence.ts`
