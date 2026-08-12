---
schema: bioxfoundry.error-page/v1
code: SOURCE_EXCLUDED_BY_POLICY
source: error/catalog.json
generated: true
---

# SOURCE_EXCLUDED_BY_POLICY — Source excluded by policy

- Subsystem: `source`
- Severity: `error`
- Error class: `policy`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The source excluded by policy operation was refused by an explicit safety or authority boundary.

## Likely causes

- the requested action is outside the allowed policy
- required approval, grounding or mutation authority is absent

## Impact

The operation is not applied; existing accepted state is preserved.

## Resolution

Do not bypass the boundary. Correct the request or provide the required scoped authority and repeat validation.

## Emitted by

- `src/runtime/project-integrity.ts`
