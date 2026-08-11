---
schema: bioxfoundry.error-page/v1
code: DASHBOARD_PORT_INVALID
source: error/catalog.json
generated: true
---

# DASHBOARD_PORT_INVALID — Dashboard port invalid

- Subsystem: `dashboard`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The requested dashboard port is not an integer in the TCP port range 1..65535.

## Likely causes

- PORT contains non-numeric text or a fractional value
- PORT is zero, negative or greater than 65535

## Impact

The dashboard is not started and no socket is opened.

## Resolution

Set PORT to an unused integer from 1 through 65535, for example make dashboard PORT=7332.

## Emitted by

- `scripts/dashboard-port-check.mjs`
