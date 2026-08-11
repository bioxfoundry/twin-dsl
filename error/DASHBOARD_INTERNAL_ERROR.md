---
schema: bioxfoundry.error-page/v1
code: DASHBOARD_INTERNAL_ERROR
source: error/catalog.json
generated: true
---

# DASHBOARD_INTERNAL_ERROR — Dashboard internal error

- Subsystem: `dashboard`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The dashboard caught an unexpected failure whose thrown value did not expose a stable, catalogued error code.

## Likely causes

- a programmer error or an unhandled operating-system or third-party failure occurred
- the originating subsystem threw free-form text instead of a stable error code

## Impact

The request returns HTTP 500 and the operation is not accepted; previously accepted runtime state is preserved.

## Resolution

Inspect the response detail and dashboard server log, fix the originating failure and give it a specific catalogued code where possible, then retry the request.

## Emitted by

- `src/serve/dashboard.ts`
