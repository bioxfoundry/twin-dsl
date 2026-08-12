---
schema: bioxfoundry.error-page/v1
code: ANALYSIS_TRACE_FORMAT_INVALID
source: error/catalog.json
generated: true
---

# ANALYSIS_TRACE_FORMAT_INVALID — Analysis trace format invalid

- Subsystem: `analysis`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `response`

## Meaning

The dashboard analysis endpoint received an unsupported representation format.

## Likely causes

- the format query parameter is not json, md or dsl
- a client constructed the analysis URL with a stale or misspelled format

## Impact

No report is returned; active Twin and analysis artifacts remain unchanged.

## Resolution

Request /api/analysis?format=json, /api/analysis?format=md or /api/analysis?format=dsl.

## Emitted by

- `src/serve/dashboard.ts`
