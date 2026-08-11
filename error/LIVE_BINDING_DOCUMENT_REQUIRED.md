---
schema: bioxfoundry.error-page/v1
code: LIVE_BINDING_DOCUMENT_REQUIRED
source: error/catalog.json
generated: true
---

# LIVE_BINDING_DOCUMENT_REQUIRED — Live binding document required

- Subsystem: `live`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The live binding document input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `js/live-twin-state/src/live-binding.ts`
