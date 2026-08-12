---
schema: bioxfoundry.error-page/v1
code: PROCESS_KINEMATIC_MAPPING_MISSING
source: error/catalog.json
generated: true
---

# PROCESS_KINEMATIC_MAPPING_MISSING — Process kinematic mapping missing

- Subsystem: `process`
- Severity: `info`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

Source-backed machine coordinates are not yet bound to the transforms of movable scene subassemblies.

## Likely causes

- firmware describes axes or encoder positions without identifying the corresponding imported mesh frames
- CAD parts exist, but their joints, pivots, travel directions or coordinate origins are not documented

## Impact

Animation highlights the affected assembly group but does not fabricate literal translations or rotations.

## Resolution

Create and validate axis-to-subassembly bindings with frame origin, direction, joint limits and source evidence before enabling transform animation.

## Emitted by

- `src/runtime/process-model.ts`
