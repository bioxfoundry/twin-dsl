---
schema: bioxfoundry.error-page/v1
code: PROCESS_EVIDENCE_INDEX_INVALID
source: error/catalog.json
generated: true
---

# PROCESS_EVIDENCE_INDEX_INVALID — Process evidence index invalid

- Subsystem: `process`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The process-level evidence index does not exactly represent the evidence attached to its steps.

## Likely causes

- a step evidence record was added or removed without rebuilding the process index
- process artifacts from different source snapshots were combined

## Impact

The candidate is rejected so consumers cannot mistake an incomplete or stale index for the step provenance.

## Resolution

Regenerate the process evidence index as the unique union of all step evidence intent ids, then validate again.

## Emitted by

- `src/dsl/process.ts`
