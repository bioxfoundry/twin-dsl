---
schema: bioxfoundry.error-page/v1
code: SPEC_TWIN_REQUIREMENT_UNMAPPED
source: error/catalog.json
generated: true
---

# SPEC_TWIN_REQUIREMENT_UNMAPPED — Spec twin requirement unmapped

- Subsystem: `spec`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

A laboratory module explicitly required by the canonical study has no distinct addressable Twin component.

## Likely causes

- the blueprint omitted a required component identity
- two different devices were incorrectly collapsed into one component

## Impact

The dashboard and generator cannot attach evidence, state or future geometry to that requirement independently.

## Resolution

Add a distinct source-grounded component and scene binding; leave position and dimensions missing when the source does not provide them.

## Emitted by

- `src/runtime/specification-dsl-validation.ts`
