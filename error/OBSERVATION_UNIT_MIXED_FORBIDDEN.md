---
schema: bioxfoundry.error-page/v1
code: OBSERVATION_UNIT_MIXED_FORBIDDEN
source: error/catalog.json
generated: true
---

# OBSERVATION_UNIT_MIXED_FORBIDDEN — Observation unit mixed forbidden

- Subsystem: `observation`
- Severity: `error`
- Error class: `policy`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The observation unit mixed operation was refused by an explicit safety or authority boundary.

## Likely causes

- the requested action is outside the allowed policy
- required approval, grounding or mutation authority is absent

## Impact

The operation is not applied; existing accepted state is preserved.

## Resolution

Do not bypass the boundary. Correct the request or provide the required scoped authority and repeat validation.

## Emitted by

- `src/runtime/living-project.ts`
