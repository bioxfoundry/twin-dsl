---
schema: bioxfoundry.error-page/v1
code: PROCESS_TIMING_UNSPECIFIED
source: error/catalog.json
generated: true
---

# PROCESS_TIMING_UNSPECIFIED — Process timing unspecified

- Subsystem: `process`
- Severity: `info`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

The source does not specify laboratory durations for the modeled process steps.

## Likely causes

- the study describes logic and data flow without cycle-time parameters
- device-specific timing belongs to an SOP or machine configuration not present in the corpus

## Impact

Animation uses normalized display timing that must not be interpreted as real execution time or device control.

## Resolution

Add reviewed timing evidence to the process source; until then preserve factualProcessDuration=false and the dashboard disclaimer.

## Emitted by

- `src/runtime/process-model.ts`
