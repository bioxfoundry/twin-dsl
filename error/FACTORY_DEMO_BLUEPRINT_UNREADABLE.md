---
schema: bioxfoundry.error-page/v1
code: FACTORY_DEMO_BLUEPRINT_UNREADABLE
source: error/catalog.json
generated: true
---

# FACTORY_DEMO_BLUEPRINT_UNREADABLE — Factory demo blueprint unreadable

- Subsystem: `factory`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The scene blueprint named by the generated factory demo cannot be read as JSON.

## Likely causes

- the blueprint file is missing or inaccessible
- the file is truncated or contains invalid JSON

## Impact

The demo migrator and dashboard startup stop without overwriting the unreadable file.

## Resolution

Inspect the path and parser detail, restore valid JSON or move the broken generated .factory-demo aside, then rerun make dashboard.

## Emitted by

- `src/project/factory-demo.ts`
