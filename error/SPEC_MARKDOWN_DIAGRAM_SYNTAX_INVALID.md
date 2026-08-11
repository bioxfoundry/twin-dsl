---
schema: bioxfoundry.error-page/v1
code: SPEC_MARKDOWN_DIAGRAM_SYNTAX_INVALID
source: error/catalog.json
generated: true
---

# SPEC_MARKDOWN_DIAGRAM_SYNTAX_INVALID — Spec markdown diagram syntax invalid

- Subsystem: `spec`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `diagnostic`

## Meaning

Translated Markdown contains a malformed image token and no longer addresses its diagram reliably.

## Likely causes

- a translator rewrote Markdown delimiters around an image
- the image label and destination were not protected as separate translation spans

## Impact

The diagram disappears from rendered documentation and its evidence cannot reach the Twin.

## Resolution

Protect Markdown punctuation and destination bytes during translation, regenerate the document and verify every local target exists.

## Emitted by

- `src/runtime/specification-dsl-validation.ts`
