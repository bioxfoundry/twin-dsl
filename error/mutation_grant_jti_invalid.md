---
schema: bioxfoundry.error-page/v1
code: mutation_grant_jti_invalid
source: error/catalog.json
generated: true
---

# mutation_grant_jti_invalid — Mutation grant jti invalid

- Subsystem: `mutation grant`
- Severity: `error`
- Error class: `policy`
- Retryable: `false`
- Surfaces: `response`

## Meaning

The mutation grant jti operation was refused by an explicit safety or authority boundary.

## Likely causes

- the requested action is outside the allowed policy
- required approval, grounding or mutation authority is absent

## Impact

The operation is not applied; existing accepted state is preserved.

## Resolution

Do not bypass the boundary. Correct the request or provide the required scoped authority and repeat validation.

## Emitted by

- `src/runtime/mutation-grant.ts`
