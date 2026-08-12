---
schema: bioxfoundry.error-page/v1
code: CONCEPTUAL_GEOMETRY_ASSUMPTION
source: error/catalog.json
generated: true
---

# CONCEPTUAL_GEOMETRY_ASSUMPTION — Conceptual geometry assumption

- Subsystem: `conceptual`
- Severity: `warning`
- Error class: `evidence`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

A physical or hybrid scene object still uses a simple primitive because no grounded component-level mesh has been accepted.

## Likely causes

- the project corpus has no component-specific CAD or mesh
- a candidate model has not passed identity, license, hash, unit or physical-evidence intake

## Impact

The Twin remains usable, but the visual is conceptual and must not be interpreted as the actual device shape.

## Resolution

Acquire or upload component-specific geometry, preserve license and provenance, normalize it to metres, bind its content URI through physical-evidence intake and rerun the iteration.

## Emitted by

- `src/runtime/project-integrity.ts`
