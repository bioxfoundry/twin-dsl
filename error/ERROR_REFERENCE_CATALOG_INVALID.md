---
schema: bioxfoundry.error-page/v1
code: ERROR_REFERENCE_CATALOG_INVALID
source: error/catalog.json
generated: true
---

# ERROR_REFERENCE_CATALOG_INVALID — Error reference catalog invalid

- Subsystem: `error`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

error/catalog.json exists but is malformed or does not implement bioxfoundry.error-catalog/v1.

## Likely causes

- the catalog contains invalid JSON
- schema, entries or an entry's required fields have been edited incorrectly

## Impact

Dashboard startup is refused rather than serving incomplete or misleading error guidance.

## Resolution

Correct error/catalog.json, regenerate pages with npm run errors:docs and run npm run errors:check before restarting the dashboard.

## Emitted by

- `src/serve/dashboard.ts`
