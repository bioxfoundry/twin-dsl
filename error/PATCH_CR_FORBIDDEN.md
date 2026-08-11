---
schema: bioxfoundry.error-page/v1
code: PATCH_CR_FORBIDDEN
source: error/catalog.json
generated: true
---

# PATCH_CR_FORBIDDEN — Patch cr forbidden

- Subsystem: `patch`
- Severity: `error`
- Error class: `policy`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The patch cr operation was refused by an explicit safety or authority boundary.

## Likely causes

- the requested action is outside the allowed policy
- required approval, grounding or mutation authority is absent

## Impact

The operation is not applied; existing accepted state is preserved.

## Resolution

Do not bypass the boundary. Correct the request or provide the required scoped authority and repeat validation.

## Emitted by

- `src/llm/patch-dsl.ts`
