---
schema: bioxfoundry.error-page/v1
code: ERROR_REFERENCE_CODE_INVALID
source: error/catalog.json
generated: true
---

# ERROR_REFERENCE_CODE_INVALID — Error reference code invalid

- Subsystem: `error`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `response`

## Meaning

An error-reference URL contains a code outside the allowed stable-code grammar.

## Likely causes

- the URL contains lowercase text, separators, traversal syntax or other unsafe characters
- a caller placed variable detail in the code segment instead of after a colon

## Impact

The reference request returns HTTP 400 and no filesystem path is resolved from the supplied value.

## Resolution

Use the exact stable UPPER_SNAKE_CASE code emitted by the operation, without its colon-delimited detail, in /api/errors/<CODE> or /error/<CODE>.md.

## Emitted by

- `src/serve/dashboard.ts`
