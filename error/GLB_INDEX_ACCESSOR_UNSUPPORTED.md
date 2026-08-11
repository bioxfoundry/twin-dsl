---
schema: bioxfoundry.error-page/v1
code: GLB_INDEX_ACCESSOR_UNSUPPORTED
source: error/catalog.json
generated: true
---

# GLB_INDEX_ACCESSOR_UNSUPPORTED — Glb index accessor unsupported

- Subsystem: `glb`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

A GLB primitive uses an index accessor type unsupported by the dashboard renderer.

## Likely causes

- the accessor is not a non-empty SCALAR
- indices use a component type other than unsigned byte, unsigned short or unsigned int
- the accessor or bufferView is missing

## Impact

The mesh is rejected and the dashboard retains safe fallback geometry for the component.

## Resolution

Re-export the mesh with SCALAR indices encoded as UNSIGNED_BYTE, UNSIGNED_SHORT or, where supported, UNSIGNED_INT.

## Emitted by

- `public/dashboard.html`
