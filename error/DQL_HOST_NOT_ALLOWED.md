---
schema: bioxfoundry.error-page/v1
code: DQL_HOST_NOT_ALLOWED
source: error/catalog.json
generated: true
---

# DQL_HOST_NOT_ALLOWED — Dql host not allowed

- Subsystem: `dql`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the dql host not allowed condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/research/crawler.ts`
