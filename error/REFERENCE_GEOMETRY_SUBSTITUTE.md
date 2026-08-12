---
schema: bioxfoundry.error-page/v1
code: REFERENCE_GEOMETRY_SUBSTITUTE
source: error/catalog.json
generated: true
---

# REFERENCE_GEOMETRY_SUBSTITUTE — Reference geometry substitute

- Subsystem: `reference`
- Severity: `warning`
- Error class: `evidence`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The dashboard renders a licensed reference model whose function or product class matches the component, but the model does not prove the installed/as-built device.

## Likely causes

- the specification permits a class of equipment without selecting an exact product
- the selected model is a documented implementation or compatible open-hardware reference, not surveyed site geometry

## Impact

Visual detail is improved without promoting the reference to as-built evidence; project integrity remains explicitly incomplete.

## Resolution

Keep geometryRepresentationClass and limitations visible. Replace the reference only after manufacturer, user-uploaded or surveyed geometry passes identity, license, hash, unit and placement validation.

## Emitted by

- `src/runtime/project-integrity.ts`
