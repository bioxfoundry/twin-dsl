---
schema: bioxfoundry.error-page/v1
code: ERROR_REFERENCE_ASSETS_NOT_FOUND
source: error/catalog.json
generated: true
---

# ERROR_REFERENCE_ASSETS_NOT_FOUND — Error reference assets not found

- Subsystem: `error`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`, `response`

## Meaning

The dashboard cannot locate the generated error catalog and Markdown pages in its installed runtime layout.

## Likely causes

- error/catalog.json or the error pages were omitted from the source, dist or vendored runtime
- a container image was built without copying the error directory

## Impact

Dashboard startup is refused because failures could not provide their required local documentation.

## Resolution

Restore error/catalog.json and its generated pages, run npm run errors:docs and npm run errors:check, then rebuild or resync the vendored runtime/container.

## Emitted by

- `src/serve/dashboard.ts`
