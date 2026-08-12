---
schema: bioxfoundry.error-page/v1
code: SOURCE_CITATION_INVALID
source: error/catalog.json
generated: true
---

# SOURCE_CITATION_INVALID — Source citation invalid

- Subsystem: `source`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

A source-document request is not an immutable subactor://markdown citation.

## Likely causes

- the artifact URI uses another scheme, is empty or contains path traversal
- the revision parameter is not a 64-character lowercase SHA-256 digest

## Impact

The server refuses the source bytes and does not interpret the request as a filesystem path.

## Resolution

Follow the href emitted in analysis-trace.md/json or pass its exact artifactUri and revisionHash to /api/source.

## Emitted by

- `src/serve/dashboard.ts`
