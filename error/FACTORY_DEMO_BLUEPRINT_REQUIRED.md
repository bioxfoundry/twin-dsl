---
schema: bioxfoundry.error-page/v1
code: FACTORY_DEMO_BLUEPRINT_REQUIRED
source: error/catalog.json
generated: true
---

# FACTORY_DEMO_BLUEPRINT_REQUIRED — Factory demo blueprint required

- Subsystem: `factory`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The generated factory-demo project DSL does not name a scene blueprint file.

## Likely causes

- project.projectdsl is stale, truncated or edited by hand
- the SCENE blueprint declaration was removed

## Impact

The demo cannot be validated or safely migrated and dashboard startup stops.

## Resolution

Move the broken generated .factory-demo aside or restore its SCENE blueprint declaration, then rerun make dashboard so the canonical demo can be created or validated.

## Emitted by

- `src/project/factory-demo.ts`
