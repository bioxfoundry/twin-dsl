---
schema: bioxfoundry.error-page/v1
code: TODO2CODE_APPROVAL_HASH_REQUIRED
source: error/catalog.json
generated: true
---

# TODO2CODE_APPROVAL_HASH_REQUIRED — Todo2code approval hash required

- Subsystem: `todo2code`
- Severity: `error`
- Error class: `policy`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The todo2code approval hash operation was refused by an explicit safety or authority boundary.

## Likely causes

- the requested action is outside the allowed policy
- required approval, grounding or mutation authority is absent

## Impact

The operation is not applied; existing accepted state is preserved.

## Resolution

Do not bypass the boundary. Correct the request or provide the required scoped authority and repeat validation.

## Emitted by

- `src/adapters/todo2code.ts`
