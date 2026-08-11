---
schema: bioxfoundry.error-page/v1
code: DASHBOARD_PORT_CONFLICT
source: error/catalog.json
generated: true
---

# DASHBOARD_PORT_CONFLICT — Dashboard port conflict

- Subsystem: `dashboard`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The requested dashboard port is already owned by another twin or by a service that is not a Digital Twin dashboard.

## Likely causes

- another project dashboard is already listening on the requested host and port
- a non-dashboard service occupies the port
- the dashboard on that port reports a twin id different from the configured project

## Impact

Startup is refused so that the command cannot silently open or mutate the wrong project.

## Resolution

Read expected= and actual= from the error detail. Stop the conflicting process or choose a free PORT; reuse is allowed only when the reported twin id matches the configured project.

## Emitted by

- `scripts/dashboard-port-check.mjs`
