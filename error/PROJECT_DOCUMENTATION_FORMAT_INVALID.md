---
schema: bioxfoundry.error-page/v1
code: PROJECT_DOCUMENTATION_FORMAT_INVALID
source: error/catalog.json
generated: true
---

# PROJECT_DOCUMENTATION_FORMAT_INVALID — Project documentation format invalid

- Subsystem: `project`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `response`

## Meaning

The dashboard documentation endpoint received an unsupported export format.

## Likely causes

- the format query parameter is not md, html, pdf, json or manifest
- a client constructed the download URL with a stale or misspelled format

## Impact

No documentation file is returned; accepted runtime artifacts remain unchanged.

## Resolution

Request /api/documentation with format=md, html, pdf, json or manifest.

## Emitted by

- `src/serve/dashboard.ts`
