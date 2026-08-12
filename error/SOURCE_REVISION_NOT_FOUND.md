---
schema: bioxfoundry.error-page/v1
code: SOURCE_REVISION_NOT_FOUND
source: error/catalog.json
generated: true
---

# SOURCE_REVISION_NOT_FOUND — Source revision not found

- Subsystem: `source`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `exception`

## Meaning

The cited Markdown bytes are unavailable under declared project source roots or no longer match the cited SHA-256 revision.

## Likely causes

- the source mirror was not mounted or copied with the project
- the Markdown file changed after intentDSL generation and must be re-converted or restored

## Impact

The citation remains recorded, but the dashboard refuses to show unverified or drifted source text.

## Resolution

Restore or mount the artifact bytes whose SHA-256 equals revision, or regenerate and validate intentDSL plus the Twin analysis from the new source revision.

## Emitted by

- `src/serve/dashboard.ts`
