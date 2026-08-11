---
schema: bioxfoundry.error-page/v1
code: CLICKHOUSE_NATIVE_PORT
source: error/catalog.json
generated: true
---

# CLICKHOUSE_NATIVE_PORT — Clickhouse native port

- Subsystem: `clickhouse`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `operator`

## Meaning

The runtime stopped because it detected the clickhouse native port condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `Makefile`
- `app.doql.less`
