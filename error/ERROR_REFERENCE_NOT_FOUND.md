---
schema: bioxfoundry.error-page/v1
code: ERROR_REFERENCE_NOT_FOUND
source: error/catalog.json
generated: true
---

# ERROR_REFERENCE_NOT_FOUND — Error reference not found

- Subsystem: `error`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `response`

## Meaning

The requested stable code is syntactically valid but has no entry in the installed error catalog.

## Likely causes

- the code was mistyped or belongs to a different runtime version
- a new emitted code was not bootstrapped, documented and packaged

## Impact

The reference request returns HTTP 404; the originating operation and its stable code remain unchanged.

## Resolution

Correct the requested code, or add its source and catalog entry, run npm run errors:bootstrap followed by npm run errors:docs and npm run errors:check, then rebuild the runtime.

## Emitted by

- `src/serve/dashboard.ts`
