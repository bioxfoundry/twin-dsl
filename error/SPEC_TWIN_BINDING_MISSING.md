---
schema: bioxfoundry.error-page/v1
code: SPEC_TWIN_BINDING_MISSING
source: error/catalog.json
generated: true
---

# SPEC_TWIN_BINDING_MISSING — Spec twin binding missing

- Subsystem: `spec`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

An addressable component exists in the scene blueprint but has no binding, so it can silently disappear from the Scene and dashboard.

## Likely causes

- a component was added without updating bindings
- a binding still points at an old component identifier
- unknown geometry caused omission instead of a semantic scope binding

## Impact

Component and binding counts alone are not accepted as proof of one-to-one scene coverage.

## Resolution

Add a stable unique scene path; when dimensions or position lack evidence, use primitive scope and leave spatial values absent rather than inventing geometry.

## Emitted by

- `src/runtime/specification-dsl-validation.ts`
