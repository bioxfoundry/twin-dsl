---
schema: bioxfoundry.error-page/v1
code: INVALID_SERVER_RESPONSE
source: error/catalog.json
generated: true
---

# INVALID_SERVER_RESPONSE — Invalid server response

- Subsystem: `dashboard`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `response`

## Meaning

The dashboard received an iteration response that could not be decoded as the required JSON envelope.

## Likely causes

- a proxy or server returned HTML, empty content or truncated JSON
- the dashboard process stopped while handling the request
- client and server versions expose incompatible response formats

## Impact

The browser does not claim that the iteration succeeded; the last accepted state remains displayed.

## Resolution

Inspect the /api/iterate response and dashboard server log, confirm /api/state returns JSON, restart matching client/server versions if needed and retry.

## Emitted by

- `public/dashboard.html`
