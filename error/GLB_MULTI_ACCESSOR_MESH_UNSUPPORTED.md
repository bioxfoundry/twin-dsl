---
schema: bioxfoundry.error-page/v1
code: GLB_MULTI_ACCESSOR_MESH_UNSUPPORTED
source: error/catalog.json
generated: true
---

# GLB_MULTI_ACCESSOR_MESH_UNSUPPORTED — Glb multi accessor mesh unsupported

- Subsystem: `glb`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

One GLB mesh contains primitives that do not share the same POSITION and NORMAL accessor tables.

## Likely causes

- the exporter wrote independent vertex tables for material or group primitives
- the asset requires a full scene-graph loader outside the dashboard's lightweight contract

## Impact

The dashboard refuses to combine incompatible vertex tables and shows fallback geometry instead of a distorted mesh.

## Resolution

Run the project's deterministic mesh converter or re-export the GLB with shared POSITION/NORMAL accessors across primitives; otherwise split it into separately bound assets.

## Emitted by

- `public/dashboard.html`
