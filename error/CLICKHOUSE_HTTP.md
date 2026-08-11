---
schema: bioxfoundry.error-page/v1
code: CLICKHOUSE_HTTP
source: error/catalog.json
generated: true
---

# CLICKHOUSE_HTTP — Clickhouse http

- Subsystem: `clickhouse`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `exception`

## Meaning

The clickhouse dependency or operation was unavailable at the runtime boundary.

## Likely causes

- the service or executable is not running
- configuration, network access or the selected adapter is unavailable

## Impact

The requested stage cannot complete, but persisted accepted artifacts remain unchanged.

## Resolution

Inspect the detail following the code, verify service/tool health and configuration, then retry when the dependency is available.

## Emitted by

- `src/adapters/clickhouse.ts`
