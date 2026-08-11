---
schema: bioxfoundry.error-page/v1
code: mutation_grant_file_not_configured
source: error/catalog.json
generated: true
---

# mutation_grant_file_not_configured — Mutation grant file not configured

- Subsystem: `mutation grant`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `response`

## Meaning

The mutation grant file dependency or operation was unavailable at the runtime boundary.

## Likely causes

- the service or executable is not running
- configuration, network access or the selected adapter is unavailable

## Impact

The requested stage cannot complete, but persisted accepted artifacts remain unchanged.

## Resolution

Inspect the detail following the code, verify service/tool health and configuration, then retry when the dependency is available.

## Emitted by

- `src/runtime/mutation-grant.ts`
