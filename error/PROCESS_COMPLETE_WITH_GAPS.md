---
schema: bioxfoundry.error-page/v1
code: PROCESS_COMPLETE_WITH_GAPS
source: error/catalog.json
generated: true
---

# PROCESS_COMPLETE_WITH_GAPS — Process complete with gaps

- Subsystem: `process`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

A process is marked complete while still declaring missing source evidence or unresolved implementation gaps.

## Likely causes

- completeness was promoted without resolving every recorded gap
- a source update removed evidence used by an earlier complete model

## Impact

The process document is rejected instead of overstating what the supplied materials prove.

## Resolution

Either attach evidence for every required step and remove the gaps, or downgrade completeness to partial or declared-only before regenerating.

## Emitted by

- `src/dsl/process.ts`
