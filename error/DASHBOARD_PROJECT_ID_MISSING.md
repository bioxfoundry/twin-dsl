---
schema: bioxfoundry.error-page/v1
code: DASHBOARD_PROJECT_ID_MISSING
source: error/catalog.json
generated: true
---

# DASHBOARD_PROJECT_ID_MISSING — Dashboard project id missing

- Subsystem: `dashboard`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The selected project.projectdsl does not contain the required PROJECT identifier.

## Likely causes

- the wrong file was passed as CONFIG
- the project DSL is empty, truncated or uses an unsupported header

## Impact

Port ownership cannot be matched to a twin, so dashboard startup is refused.

## Resolution

Point CONFIG at a valid project.projectdsl containing a PROJECT <id> line, then validate the DSL and retry.

## Emitted by

- `scripts/dashboard-port-check.mjs`
