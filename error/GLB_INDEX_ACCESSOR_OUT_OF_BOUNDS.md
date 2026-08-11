---
schema: bioxfoundry.error-page/v1
code: GLB_INDEX_ACCESSOR_OUT_OF_BOUNDS
source: error/catalog.json
generated: true
---

# GLB_INDEX_ACCESSOR_OUT_OF_BOUNDS — Glb index accessor out of bounds

- Subsystem: `glb`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

A GLB primitive's index accessor points outside its declared binary buffer view.

## Likely causes

- index byteOffset, byteStride or count exceeds the BIN chunk
- the file is truncated or its index metadata is corrupt

## Impact

The dashboard rejects that mesh rather than drawing indices from an invalid range.

## Resolution

Validate and regenerate the GLB, ensuring every index accessor's offset, stride, component size and count fit its bufferView and BIN chunk.

## Emitted by

- `public/dashboard.html`
