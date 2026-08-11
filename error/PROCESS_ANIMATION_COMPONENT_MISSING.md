---
schema: bioxfoundry.error-page/v1
code: PROCESS_ANIMATION_COMPONENT_MISSING
source: error/catalog.json
generated: true
---

# PROCESS_ANIMATION_COMPONENT_MISSING — Process animation component missing

- Subsystem: `process`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

An animation effect references a component that is absent from the accepted SceneDSL.

## Likely causes

- the process model and scene were generated from different project revisions
- a process actor was renamed or omitted while its animation binding remained

## Impact

The animation candidate is rejected, so the dashboard cannot present a misleading effect on another object.

## Resolution

Use the component id in the error detail to repair the process actor or SceneDSL binding, regenerate both artifacts from one revision, and validate again.

## Emitted by

- `src/runtime/process-animation.ts`
