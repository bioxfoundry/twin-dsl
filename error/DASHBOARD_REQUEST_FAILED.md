---
schema: bioxfoundry.error-page/v1
code: DASHBOARD_REQUEST_FAILED
source: error/catalog.json
generated: true
---

# DASHBOARD_REQUEST_FAILED — Dashboard request failed

- Subsystem: `dashboard`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `response`

## Meaning

The browser could not complete or decode a dashboard API request.

## Likely causes

- the dashboard server stopped or became unreachable
- the network request was interrupted
- the endpoint returned a response that is not valid JSON

## Impact

The requested browser action is not reported as successful; the last rendered accepted state remains visible.

## Resolution

Open /api/state, inspect the dashboard server log and browser network response, restart or reload the dashboard if needed, then retry.

## Emitted by

- `public/dashboard.html`
