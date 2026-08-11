---
schema: bioxfoundry.error-page/v1
code: OPENROUTER_INVALID_JSON
source: error/catalog.json
generated: true
---

# OPENROUTER_INVALID_JSON — Openrouter invalid json

- Subsystem: `openrouter`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the openrouter invalid json condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/llm/openrouter.ts`
