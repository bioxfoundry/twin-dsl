---
schema: bioxfoundry.error-page/v1
code: SPEC_INTENT_CORRUPTION_DETECTED
source: error/catalog.json
generated: true
---

# SPEC_INTENT_CORRUPTION_DETECTED — Spec intent corruption detected

- Subsystem: `spec`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

A compiled intent record contains a known deterministic translation corruption.

## Likely causes

- the translation engine rewrote a technical identifier or approximate numeric value
- intentDSL was compiled from an older corrupted Markdown revision

## Impact

The affected intent pack is rejected because downstream Twin facts would be misleading.

## Resolution

Compare the named phrase with the source-language page, repair the translation rule, regenerate Markdown sidecars and recompile intentDSL.

## Emitted by

- `src/runtime/specification-dsl-validation.ts`
