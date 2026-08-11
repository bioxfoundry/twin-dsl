---
schema: bioxfoundry.error-page/v1
code: GEOMETRY_BUILD_RECEIPT_VALIDATION_POLICY_HASH_INVALID
source: error/catalog.json
generated: true
---

# GEOMETRY_BUILD_RECEIPT_VALIDATION_POLICY_HASH_INVALID — Geometry build receipt validation policy hash invalid

- Subsystem: `geometry build`
- Severity: `error`
- Error class: `policy`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The geometry build receipt validation policy hash operation was refused by an explicit safety or authority boundary.

## Likely causes

- the requested action is outside the allowed policy
- required approval, grounding or mutation authority is absent

## Impact

The operation is not applied; existing accepted state is preserved.

## Resolution

Do not bypass the boundary. Correct the request or provide the required scoped authority and repeat validation.

## Emitted by

- `src/geometry/build-contract.ts`
