---
schema: bioxfoundry.error-page/v1
code: PROJECT_DOCUMENTATION_REVISION_MISMATCH
source: error/catalog.json
generated: true
---

# PROJECT_DOCUMENTATION_REVISION_MISMATCH — Project documentation revision mismatch

- Subsystem: `project`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The current project, Twin, Scene, Process or analysis trace does not describe one content-addressed accepted revision.

## Likely causes

- current/ contains artifacts copied from different iterations
- the analysis trace URI, source snapshot hash or Scene source Twin identity no longer matches the accepted bytes

## Impact

Export fails closed instead of presenting a mixed or stale project description.

## Resolution

Do not edit current/ manually. Restore it from one accepted receipt or run a validated iteration so all dependent artifacts are published together.

## Emitted by

- `src/runtime/project-documentation.ts`
