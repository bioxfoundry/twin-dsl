---
schema: bioxfoundry.error-page/v1
code: ARCHIVE_GEOMETRY_SELECTION_LIMIT
source: error/catalog.json
generated: true
---

# ARCHIVE_GEOMETRY_SELECTION_LIMIT — Archive geometry selection limit

- Subsystem: `archive`
- Severity: `error`
- Error class: `state`
- Retryable: `true`
- Surfaces: `diagnostic`

## Meaning

The archive geometry selection operation cannot proceed in the current bounded runtime state.

## Likely causes

- another writer or operation is active
- a configured size, time or concurrency budget was reached

## Impact

The current request is delayed or refused without replacing accepted state.

## Resolution

Wait for the active operation to finish or reduce the bounded input; change limits only through an explicit reviewed configuration.

## Emitted by

- `js/archive-project-analyzer/src/analyze.ts`
