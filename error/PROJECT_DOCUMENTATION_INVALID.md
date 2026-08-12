---
schema: bioxfoundry.error-page/v1
code: PROJECT_DOCUMENTATION_INVALID
source: error/catalog.json
generated: true
---

# PROJECT_DOCUMENTATION_INVALID — Project documentation invalid

- Subsystem: `project`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

One of the accepted runtime artifacts cannot be projected into subactor.project-documentation/v1.

## Likely causes

- project, resource or integrity artifact shape does not match its declared schema
- a required documentation field is missing or has the wrong type

## Impact

No misleading report is generated; the accepted Twin and Scene are not changed.

## Resolution

Inspect the detail after the code, validate current/ artifacts and regenerate the accepted iteration before exporting again.

## Emitted by

- `src/runtime/project-documentation.ts`
