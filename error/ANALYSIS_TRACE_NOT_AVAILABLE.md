---
schema: bioxfoundry.error-page/v1
code: ANALYSIS_TRACE_NOT_AVAILABLE
source: error/catalog.json
generated: true
---

# ANALYSIS_TRACE_NOT_AVAILABLE — Analysis trace not available

- Subsystem: `analysis`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `response`

## Meaning

No accepted analysis trace exists in the active current/ artifact set.

## Likely causes

- the project has not completed a trace-enabled iteration
- the latest candidate was rejected and no prior accepted report exists

## Impact

The dashboard cannot return the requested report, but any accepted Twin and Scene remain unchanged.

## Resolution

Run one validated project iteration and inspect candidate/analysis-trace.* plus latest.json if publication is blocked.

## Emitted by

- `src/serve/dashboard.ts`
