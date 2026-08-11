---
schema: bioxfoundry.error-page/v1
code: GLB_UINT_INDEX_EXTENSION_UNAVAILABLE
source: error/catalog.json
generated: true
---

# GLB_UINT_INDEX_EXTENSION_UNAVAILABLE — Glb uint index extension unavailable

- Subsystem: `glb`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `exception`

## Meaning

The GLB uses 32-bit indices but the active WebGL context does not expose OES_element_index_uint.

## Likely causes

- the browser, GPU driver or software renderer lacks the extension
- the mesh contains enough vertices that its exporter selected unsigned-int indices

## Impact

The mesh is not rendered in that browser and the component uses its safe fallback geometry.

## Resolution

Enable a WebGL implementation with OES_element_index_uint, or re-export/split the mesh so each primitive uses 16-bit indices.

## Emitted by

- `public/dashboard.html`
