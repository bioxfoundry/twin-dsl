---
schema: bioxfoundry.error-page/v1
code: GLB_PRIMITIVE_MODE_UNSUPPORTED
source: error/catalog.json
generated: true
---

# GLB_PRIMITIVE_MODE_UNSUPPORTED — Glb primitive mode unsupported

- Subsystem: `glb`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the glb primitive mode unsupported condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `public/dashboard.html`
