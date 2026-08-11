---
schema: bioxfoundry.error-page/v1
code: SCENE_BLUEPRINT_COMPONENT_INVALID
source: error/catalog.json
generated: true
---

# SCENE_BLUEPRINT_COMPONENT_INVALID — Scene blueprint component invalid

- Subsystem: `scene blueprint`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`, `exception`

## Meaning

At least one scene blueprint component is not an object or fails the current component contract.

## Likely causes

- id or type is missing or empty
- spatialClass is missing or is not an allowed spatial class
- sourceRoles is missing or contains a role outside the allowed vocabulary
- a stale blueprint generated before the current schema contract is being reused

## Impact

Scene validation and twin iteration stop before an invalid component can enter scene.json or the dashboard.

## Resolution

Regenerate or migrate the scene blueprint. Ensure every component has non-empty id and type, a supported spatialClass and a sourceRoles array containing only supported roles, then validate again.

## Emitted by

- `src/scene/blueprint.ts`
