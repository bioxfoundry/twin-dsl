---
schema: bioxfoundry.error-page/v1
code: COMPOSE_SECRET_LITERAL
source: error/catalog.json
generated: true
---

# COMPOSE_SECRET_LITERAL — Compose secret literal

- Subsystem: `compose`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the compose secret literal condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `scripts/check-compose.mjs`
