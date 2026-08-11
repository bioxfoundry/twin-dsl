---
schema: bioxfoundry.error-page/v1
code: SPEC_INTENT_PRIORITY_MISSING
source: error/catalog.json
generated: true
---

# SPEC_INTENT_PRIORITY_MISSING — Spec intent priority missing

- Subsystem: `spec`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

No canonical-study record survived in the bounded high-priority intent index.

## Likely causes

- generic source ordering displaced the canonical study
- the study pack was absent, invalid or contained only excluded claim records

## Impact

The Twin may ignore the project's authoritative architecture and equipment requirements.

## Resolution

Validate the study pack, rank canonical targets before generic source URIs, rerun the project iteration and inspect intent-dsl.index.json.

## Emitted by

- `src/runtime/specification-dsl-validation.ts`
