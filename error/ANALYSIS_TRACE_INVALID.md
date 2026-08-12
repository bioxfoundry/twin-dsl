---
schema: bioxfoundry.error-page/v1
code: ANALYSIS_TRACE_INVALID
source: error/catalog.json
generated: true
---

# ANALYSIS_TRACE_INVALID — Analysis trace invalid

- Subsystem: `analysis`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The generated AnalysisTrace JSON or DSL violates subactor.analysis-trace/v1 or references an absent citation.

## Likely causes

- a required identity, hash, decision, citation or stage is malformed
- decision or citation identifiers are duplicated, or a decision references an unknown citation

## Impact

The iteration stops before the invalid explanation can be published as an accepted report.

## Resolution

Use the suffix after ANALYSIS_TRACE_INVALID to locate the field, compare the artifact with schemas/analysis-trace.schema.json, repair the deterministic projection and rerun the iteration.

## Emitted by

- `src/runtime/analysis-trace.ts`
