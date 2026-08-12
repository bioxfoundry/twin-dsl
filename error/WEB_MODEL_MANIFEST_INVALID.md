---
schema: bioxfoundry.error-page/v1
code: WEB_MODEL_MANIFEST_INVALID
source: error/catalog.json
generated: true
---

# WEB_MODEL_MANIFEST_INVALID — Web model manifest invalid

- Subsystem: `web geometry`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The web geometry manifest is malformed or lacks required provenance, classification, revision, license or limitations.

## Likely causes

- a model entry omits source revision or license
- representationClass or limitations are absent
- the manifest schema or root collection is invalid

## Impact

Downloaded geometry is rejected before it can be treated as project evidence.

## Resolution

Complete bioxfoundry.web-geometry-manifest/v1 with source URLs, pinned revision, license, hashes, representation class, evidence basis and explicit limitations; rerun make web-models-verify.

## Emitted by

- `scripts/verify-web-models.mjs`
