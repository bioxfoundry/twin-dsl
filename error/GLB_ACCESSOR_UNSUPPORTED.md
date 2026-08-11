---
schema: bioxfoundry.error-page/v1
code: GLB_ACCESSOR_UNSUPPORTED
source: error/catalog.json
generated: true
---

# GLB_ACCESSOR_UNSUPPORTED — Glb accessor unsupported

- Subsystem: `glb`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

A GLB POSITION or NORMAL accessor uses a representation outside the dashboard's deterministic lightweight loader contract.

## Likely causes

- the accessor is not a non-empty FLOAT VEC3
- the accessor or referenced bufferView is missing

## Impact

The unsupported mesh is not rendered and the component falls back to deterministic primitive geometry.

## Resolution

Re-export or convert the mesh so POSITION and optional NORMAL are FLOAT VEC3 accessors with valid bufferViews, then re-ingest the asset.

## Emitted by

- `public/dashboard.html`
