---
schema: bioxfoundry.error-page/v1
code: SPEC_MARKDOWN_QUALITY_FALSE_PASS
source: error/catalog.json
generated: true
---

# SPEC_MARKDOWN_QUALITY_FALSE_PASS — Spec markdown quality false pass

- Subsystem: `spec`
- Severity: `error`
- Error class: `state`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

MarkdownQualityDSL says PASS while an independent deterministic structure check fails.

## Likely causes

- the quality contract does not include the failing page, hash or diagram invariant
- quality and structure sidecars came from different artifact revisions

## Impact

A corrupt conversion would otherwise be admitted as trusted source evidence.

## Resolution

Add the failed invariant to deterministic quality scoring and regenerate Markdown, structure and quality sidecars atomically.

## Emitted by

- `src/runtime/specification-dsl-validation.ts`
