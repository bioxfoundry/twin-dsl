---
schema: bioxfoundry.error-page/v1
code: WEB_MODEL_INTEGRATION_COMPONENT_MISSING
source: error/catalog.json
generated: true
---

# WEB_MODEL_INTEGRATION_COMPONENT_MISSING — Web model integration component missing

- Subsystem: `web`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The web model integration component input does not satisfy the required deterministic contract.

## Likely causes

- a required field or resource is missing
- a value, key, type, identifier or schema version is invalid

## Impact

Validation stops before the malformed input can mutate or publish runtime state.

## Resolution

Inspect the code detail and the corresponding JSON/DSL schema, correct the named input, then validate again.

## Emitted by

- `scripts/install-web-models.mjs`
