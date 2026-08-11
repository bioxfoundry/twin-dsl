---
schema: bioxfoundry.error-page/v1
code: EMPTY_VIDEO_BLOB
source: error/catalog.json
generated: true
---

# EMPTY_VIDEO_BLOB — Empty video blob

- Subsystem: `empty`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `response`

## Meaning

The browser's MediaRecorder stopped without producing any video bytes from the dashboard canvas.

## Likely causes

- the selected WebM encoder is unavailable or failed
- a headless or software-rendered browser did not deliver frames before recording stopped
- recording was stopped before the first encoded timeslice

## Impact

No empty file is downloaded; the Twin and dashboard state are unaffected.

## Resolution

Record for at least a few seconds in a browser with WebM/MediaRecorder support, ensure hardware or software WebGL is active, and retry after reloading the page.

## Emitted by

- `public/dashboard.html`
