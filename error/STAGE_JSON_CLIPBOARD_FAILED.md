---
schema: bioxfoundry.error-page/v1
code: STAGE_JSON_CLIPBOARD_FAILED
source: error/catalog.json
generated: true
---

# STAGE_JSON_CLIPBOARD_FAILED — Stage JSON clipboard export failed

- Subsystem: `dashboard`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `exception`, `response`

## Meaning

The browser could not copy the versioned #stage debug snapshot to the system clipboard.

## Likely causes

- clipboard access was denied by the browser, page permissions or document context
- both the Clipboard API and the legacy copy fallback were unavailable
- the browser could not serialize or allocate the complete DOM, WebGL frame and runtime snapshot

## Impact

No project or twin state is changed, but the requested debug bundle is not placed on the clipboard.

## Resolution

Open the dashboard through localhost, allow clipboard access for the page and press Copy JSON again. If it still fails, inspect the browser console entry stage-json:error; the generated snapshot remains available as window.__TWIN_STAGE_DEBUG__.

## Emitted by

- `public/dashboard.html`
