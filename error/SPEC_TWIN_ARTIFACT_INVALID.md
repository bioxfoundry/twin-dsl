---
schema: bioxfoundry.error-page/v1
code: SPEC_TWIN_ARTIFACT_INVALID
source: error/catalog.json
generated: true
---

# SPEC_TWIN_ARTIFACT_INVALID — Spec twin artifact invalid

- Subsystem: `spec`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The generated twin.json or scene.json is invalid, unreadable, or does not project the same component identities as the accepted blueprint.

## Likely causes

- the latest iteration failed before publishing both artifacts atomically
- nested Twin components were counted differently from flat Scene bindings
- a component was dropped, duplicated or renamed between blueprint, Twin and Scene
- a generated artifact violates its domain validator

## Impact

A dashboard showing a partial or stale scene is not accepted as the active Digital Twin.

## Resolution

Run a deterministic iteration, compare blueprint IDs with flattened Twin IDs and Scene binding IDs, repair generation rather than runtime output, then validate again.

## Emitted by

- `src/runtime/specification-dsl-validation.ts`
