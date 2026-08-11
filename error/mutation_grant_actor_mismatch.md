---
schema: bioxfoundry.error-page/v1
code: mutation_grant_actor_mismatch
source: error/catalog.json
generated: true
---

# mutation_grant_actor_mismatch — Mutation grant actor mismatch

- Subsystem: `mutation grant`
- Severity: `error`
- Error class: `policy`
- Retryable: `false`
- Surfaces: `response`

## Meaning

The mutation grant actor operation was refused by an explicit safety or authority boundary.

## Likely causes

- the requested action is outside the allowed policy
- required approval, grounding or mutation authority is absent

## Impact

The operation is not applied; existing accepted state is preserved.

## Resolution

Do not bypass the boundary. Correct the request or provide the required scoped authority and repeat validation.

## Emitted by

- `src/runtime/mutation-grant.ts`
