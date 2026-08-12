---
schema: bioxfoundry.error-page/v1
code: PROCESS_TOOLPATH_MISSING
source: error/catalog.json
generated: true
---

# PROCESS_TOOLPATH_MISSING — Process toolpath missing

- Subsystem: `process`
- Severity: `warning`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

Firmware and machine limits are available, but no reviewed executable toolpath is present for the modeled job.

## Likely causes

- the archive contains controller configuration without the experiment-specific G-code or path
- material recipe, syringe calibration or job acceptance criteria are absent

## Impact

The dashboard may present the sourced process phases, but the process remains partial and cannot drive real equipment.

## Resolution

Supply and validate the job toolpath, material identities, dispense calibration and acceptance criteria before execution.

## Emitted by

- `src/runtime/process-model.ts`
