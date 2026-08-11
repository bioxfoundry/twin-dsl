---
schema: bioxfoundry.error-page/v1
code: COMPONENT_NOT_BOUND_IN_SCENE
source: error/catalog.json
generated: true
---

# COMPONENT_NOT_BOUND_IN_SCENE — Component not bound in scene

- Subsystem: `component`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The runtime stopped because it detected the component not bound in scene condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/scene/physical-evidence.ts`
