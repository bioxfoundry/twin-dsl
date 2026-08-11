---
schema: bioxfoundry.error-page/v1
code: PATCH_PATH_FORBIDDEN
source: error/catalog.json
generated: true
---

# PATCH_PATH_FORBIDDEN — Patch path forbidden

- Subsystem: `patch`
- Severity: `error`
- Error class: `policy`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The patch path operation was refused by an explicit safety or authority boundary.

## Likely causes

- the requested action is outside the allowed policy
- required approval, grounding or mutation authority is absent

## Impact

The operation is not applied; existing accepted state is preserved.

## Resolution

Do not bypass the boundary. Correct the request or provide the required scoped authority and repeat validation.

## Emitted by

- `src/llm/patch-dsl.ts`
