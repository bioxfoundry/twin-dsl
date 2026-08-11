---
schema: bioxfoundry.error-page/v1
code: FACTORY_DEMO_ENVIRONMENT_UNREADABLE
source: error/catalog.json
generated: true
---

# FACTORY_DEMO_ENVIRONMENT_UNREADABLE — Factory demo environment unreadable

- Subsystem: `factory`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The generated factory demo's environment/current.json cannot be read as a JSON object.

## Likely causes

- the environment file is missing or inaccessible
- the file is truncated, contains invalid JSON or has a non-object root

## Impact

The demo migration and dashboard startup stop without overwriting the observation source.

## Resolution

Inspect the path and parser detail, restore a valid observation object or move the broken generated .factory-demo aside, then rerun make dashboard.

## Emitted by

- `src/project/factory-demo.ts`
