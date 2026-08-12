---
schema: bioxfoundry.error-page/v1
code: PROCESS_COMPONENT_UNMODELLED
source: error/catalog.json
generated: true
---

# PROCESS_COMPONENT_UNMODELLED — Process component unmodelled

- Subsystem: `process`
- Severity: `info`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

A sourced process endpoint exists in ProcessDSL but has no distinct physical component in TwinDSL and SceneDSL.

## Likely causes

- the source archive defines a software or network endpoint without source-backed geometry
- the current scene groups multiple logical endpoints under one orchestrator component

## Impact

The logical flow remains visible, but dashboard animation cannot identify a separate physical instrument for that endpoint.

## Resolution

Add a source-backed Twin component and scene binding when verified geometry or measured dimensions become available.

## Emitted by

- `src/runtime/process-model.ts`
