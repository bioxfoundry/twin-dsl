---
schema: bioxfoundry.error-page/v1
code: DQL_PRIVATE_DNS
source: error/catalog.json
generated: true
---

# DQL_PRIVATE_DNS — Dql private dns

- Subsystem: `dql`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the dql private dns condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/research/crawler.ts`
