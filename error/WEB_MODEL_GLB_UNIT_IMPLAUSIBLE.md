---
schema: bioxfoundry.error-page/v1
code: WEB_MODEL_GLB_UNIT_IMPLAUSIBLE
source: error/catalog.json
generated: true
---

# WEB_MODEL_GLB_UNIT_IMPLAUSIBLE — Web model glb unit implausible

- Subsystem: `web`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the web model glb unit implausible condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `scripts/verify-web-models.mjs`
