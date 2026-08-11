---
schema: bioxfoundry.error-page/v1
code: MUTATION_APPLY_APPROVAL_HASH_REQUIRED
source: error/catalog.json
generated: true
---

# MUTATION_APPLY_APPROVAL_HASH_REQUIRED — Mutation apply approval hash required

- Subsystem: `mutation apply`
- Severity: `error`
- Error class: `policy`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The mutation apply approval hash operation was refused by an explicit safety or authority boundary.

## Likely causes

- the requested action is outside the allowed policy
- required approval, grounding or mutation authority is absent

## Impact

The operation is not applied; existing accepted state is preserved.

## Resolution

Do not bypass the boundary. Correct the request or provide the required scoped authority and repeat validation.

## Emitted by

- `src/runtime/mutation-pipeline.ts`
