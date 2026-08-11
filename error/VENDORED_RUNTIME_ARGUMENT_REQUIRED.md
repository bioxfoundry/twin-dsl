---
schema: bioxfoundry.error-page/v1
code: VENDORED_RUNTIME_ARGUMENT_REQUIRED
source: error/catalog.json
generated: true
---

# VENDORED_RUNTIME_ARGUMENT_REQUIRED — Vendored runtime argument required

- Subsystem: `vendored`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The vendored runtime argument input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `scripts/sync-vendored-runtime.mjs`
