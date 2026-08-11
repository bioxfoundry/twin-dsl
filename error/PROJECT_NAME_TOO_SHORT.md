---
schema: bioxfoundry.error-page/v1
code: PROJECT_NAME_TOO_SHORT
source: error/catalog.json
generated: true
---

# PROJECT_NAME_TOO_SHORT — Project name too short

- Subsystem: `project`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the project name too short condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/project/wizard.ts`
