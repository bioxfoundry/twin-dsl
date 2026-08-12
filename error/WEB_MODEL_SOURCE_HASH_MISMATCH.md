---
schema: bioxfoundry.error-page/v1
code: WEB_MODEL_SOURCE_HASH_MISMATCH
source: error/catalog.json
generated: true
---

# WEB_MODEL_SOURCE_HASH_MISMATCH — Web model source hash mismatch

- Subsystem: `web geometry`
- Severity: `error`
- Error class: `integrity`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

A downloaded model or retained source no longer matches the immutable digest/size recorded in the web geometry manifest.

## Likely causes

- the upstream download changed
- a local binary or source file was modified or truncated
- the manifest combines artifacts from different revisions

## Impact

The model cannot enter physical-evidence intake or be published as a grounded scene asset.

## Resolution

Do not update the expected digest blindly. Re-download the pinned revision, verify license and source identity, regenerate the derivative, then review and update the manifest hashes.

## Emitted by

- `scripts/verify-web-models.mjs`
