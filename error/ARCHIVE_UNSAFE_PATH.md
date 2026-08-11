---
schema: bioxfoundry.error-page/v1
code: ARCHIVE_UNSAFE_PATH
source: error/catalog.json
generated: true
---

# ARCHIVE_UNSAFE_PATH — Archive unsafe path

- Subsystem: `archive`
- Severity: `error`
- Error class: `policy`
- Retryable: `false`
- Surfaces: `diagnostic`, `exception`

## Meaning

The archive operation was refused by an explicit safety or authority boundary.

## Likely causes

- the requested action is outside the allowed policy
- required approval, grounding or mutation authority is absent

## Impact

The operation is not applied; existing accepted state is preserved.

## Resolution

Do not bypass the boundary. Correct the request or provide the required scoped authority and repeat validation.

## Emitted by

- `js/archive-project-analyzer/src/analyze.ts`
- `src/ingestion/archive-project.ts`
- `src/ingestion/archive.ts`
