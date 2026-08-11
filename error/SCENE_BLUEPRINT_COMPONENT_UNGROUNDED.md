---
schema: bioxfoundry.error-page/v1
code: SCENE_BLUEPRINT_COMPONENT_UNGROUNDED
source: error/catalog.json
generated: true
---

# SCENE_BLUEPRINT_COMPONENT_UNGROUNDED — Scene blueprint component ungrounded

- Subsystem: `scene blueprint`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`, `exception`

## Meaning

The runtime stopped because it detected the scene blueprint component ungrounded condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/scene/blueprint.ts`
