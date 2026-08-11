---
schema: bioxfoundry.error-page/v1
code: MUTATION_GRANT_FILE_REQUIRED
source: error/catalog.json
generated: true
---

# MUTATION_GRANT_FILE_REQUIRED — Mutation grant file required

- Subsystem: `mutation grant`
- Severity: `error`
- Error class: `policy`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The mutation grant file operation was refused by an explicit safety or authority boundary.

## Likely causes

- the requested action is outside the allowed policy
- required approval, grounding or mutation authority is absent

## Impact

The operation is not applied; existing accepted state is preserved.

## Resolution

Do not bypass the boundary. Correct the request or provide the required scoped authority and repeat validation.

## Emitted by

- `src/cli/main.ts`
