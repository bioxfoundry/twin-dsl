---
schema: bioxfoundry.error-page/v1
code: DASHBOARD_READ_ONLY
source: error/catalog.json
generated: true
---

# DASHBOARD_READ_ONLY — Dashboard read only

- Subsystem: `dashboard`
- Severity: `error`
- Error class: `policy`
- Retryable: `false`
- Surfaces: `response`

## Meaning

A write endpoint was called on an inspection replica intentionally started in read-only mode.

## Likely causes

- POST /api/iterate or POST /api/intake was sent to a DT_DASHBOARD_READ_ONLY=1 process
- the inspection replica was mistaken for the elected single writer

## Impact

The request returns HTTP 403; no iteration, intake or artifact mutation is performed.

## Resolution

Keep the replica read-only and send the write through the elected iteration controller or project container. Do not disable the boundary merely to suppress the error.

## Emitted by

- `src/serve/dashboard.ts`
