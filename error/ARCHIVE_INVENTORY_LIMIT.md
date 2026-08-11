---
schema: bioxfoundry.error-page/v1
code: ARCHIVE_INVENTORY_LIMIT
source: error/catalog.json
generated: true
---

# ARCHIVE_INVENTORY_LIMIT — Archive inventory limit

- Subsystem: `archive`
- Severity: `error`
- Error class: `state`
- Retryable: `true`
- Surfaces: `exception`

## Meaning

The archive inventory operation cannot proceed in the current bounded runtime state.

## Likely causes

- another writer or operation is active
- a configured size, time or concurrency budget was reached

## Impact

The current request is delayed or refused without replacing accepted state.

## Resolution

Wait for the active operation to finish or reduce the bounded input; change limits only through an explicit reviewed configuration.

## Emitted by

- `src/ingestion/archive.ts`
