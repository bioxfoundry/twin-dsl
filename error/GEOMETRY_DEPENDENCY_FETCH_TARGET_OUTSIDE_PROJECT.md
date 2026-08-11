---
schema: bioxfoundry.error-page/v1
code: GEOMETRY_DEPENDENCY_FETCH_TARGET_OUTSIDE_PROJECT
source: error/catalog.json
generated: true
---

# GEOMETRY_DEPENDENCY_FETCH_TARGET_OUTSIDE_PROJECT — Geometry dependency fetch target outside project

- Subsystem: `geometry dependency`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The runtime stopped because it detected the geometry dependency fetch target outside project condition.

## Likely causes

- the named runtime invariant was not satisfied
- an upstream stage supplied incomplete or inconsistent state

## Impact

The affected operation does not complete and must not be reported as successful.

## Resolution

Inspect the detail appended after the code and the emitting source locations below, correct the cause and rerun the deterministic check.

## Emitted by

- `src/geometry/dependency-resolver.ts`
