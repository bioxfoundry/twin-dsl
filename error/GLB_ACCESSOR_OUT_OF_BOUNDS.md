---
schema: bioxfoundry.error-page/v1
code: GLB_ACCESSOR_OUT_OF_BOUNDS
source: error/catalog.json
generated: true
---

# GLB_ACCESSOR_OUT_OF_BOUNDS — Glb accessor out of bounds

- Subsystem: `glb`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

A GLB POSITION or NORMAL accessor points outside its declared binary buffer view.

## Likely causes

- byteOffset, byteStride or count exceeds the BIN chunk
- the GLB is truncated or its accessor metadata is corrupt

## Impact

The dashboard rejects that mesh and uses its safe fallback geometry instead of reading invalid memory ranges.

## Resolution

Validate the GLB with a glTF validator and regenerate it from the source CAD/mesh; confirm accessor offsets, strides and counts fit the BIN chunk.

## Emitted by

- `public/dashboard.html`
