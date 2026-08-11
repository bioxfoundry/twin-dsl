---
schema: bioxfoundry.error-page/v1
code: PROCESS_DETAIL_DECLARED_ONLY
source: error/catalog.json
generated: true
---

# PROCESS_DETAIL_DECLARED_ONLY — Process detail declared only

- Subsystem: `process`
- Severity: `warning`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The materials name a process capability but do not provide an ordered, executable protocol for it.

## Likely causes

- the study contains only a capability declaration or demonstration claim
- the detailed SOP, parameters, transitions or safety conditions are not present in the ingested evidence

## Impact

The capability remains visible, but no step animation or executable behavior is generated from invented details.

## Resolution

Ingest and review the missing protocol or SOP, link its intent records, then promote the process to partial or complete only after validation.

## Emitted by

- `src/runtime/process-model.ts`
