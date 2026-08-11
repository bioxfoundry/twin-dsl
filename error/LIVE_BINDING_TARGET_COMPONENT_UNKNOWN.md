---
schema: bioxfoundry.error-page/v1
code: LIVE_BINDING_TARGET_COMPONENT_UNKNOWN
source: error/catalog.json
generated: true
---

# LIVE_BINDING_TARGET_COMPONENT_UNKNOWN — Live binding target component unknown

- Subsystem: `live`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the live binding target component unknown condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `js/live-twin-state/src/projector.ts`
