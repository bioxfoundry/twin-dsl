---
schema: bioxfoundry.error-page/v1
code: DASHBOARD_READINESS_TIMEOUT
source: error/catalog.json
generated: true
---

# DASHBOARD_READINESS_TIMEOUT — Dashboard readiness timeout

- Subsystem: `dashboard`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `operator`

## Meaning

The dashboard process did not return a successful /api/state response within the bounded startup probe.

## Likely causes

- the process exited or crashed during startup
- the readiness URL or route is incorrect
- artifact loading took longer than the probe window

## Impact

make dashboard exits with failure and its cleanup trap stops the spawned server.

## Resolution

Inspect the dashboard process output and request the exact URL shown in the detail with /api/state appended once. Correct startup or routing failures, then retry.

## Emitted by

- `Makefile`
- `app.doql.less`
