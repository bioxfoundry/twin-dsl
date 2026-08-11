---
schema: bioxfoundry.error-page/v1
code: DOCLING_HEALTH_HTTP
source: error/catalog.json
generated: true
---

# DOCLING_HEALTH_HTTP — Docling health http

- Subsystem: `docling`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `exception`

## Meaning

The docling health dependency or operation was unavailable at the runtime boundary.

## Likely causes

- the service or executable is not running
- configuration, network access or the selected adapter is unavailable

## Impact

The requested stage cannot complete, but persisted accepted artifacts remain unchanged.

## Resolution

Inspect the detail following the code, verify service/tool health and configuration, then retry when the dependency is available.

## Emitted by

- `src/runtime/service-check.ts`
