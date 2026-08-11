---
schema: bioxfoundry.error-page/v1
code: FACTORY_DEMO_BLUEPRINT_IDENTITY_INVALID
source: error/catalog.json
generated: true
---

# FACTORY_DEMO_BLUEPRINT_IDENTITY_INVALID — Factory demo blueprint identity invalid

- Subsystem: `factory`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The safe factory-demo migrator found an invalid blueprint whose id does not identify the canonical generated biofoundry demo.

## Likely causes

- a custom project or blueprint was placed under .factory-demo/project
- the canonical biofoundry-live-* identity was changed or removed

## Impact

Automatic replacement is refused so that custom project data is never overwritten.

## Resolution

Do not force-migrate the custom blueprint. Run the dashboard with CONFIG pointing to that real project and migrate it explicitly, or move the custom files aside and recreate the generated .factory-demo.

## Emitted by

- `src/project/factory-demo.ts`
