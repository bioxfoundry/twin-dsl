---
schema: bioxfoundry.error-page/v1
code: FACTORY_DEMO_ENVIRONMENT_IDENTITY_INVALID
source: error/catalog.json
generated: true
---

# FACTORY_DEMO_ENVIRONMENT_IDENTITY_INVALID — Factory demo environment identity invalid

- Subsystem: `factory`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The safe demo migrator found the historical mixed-unit shape in an environment document that does not match the canonical generated demo identity.

## Likely causes

- environment/current.json belongs to a different project or has a changed subjectUri
- the expected numeric temperatureC or boolean availability fields were replaced

## Impact

Automatic unit migration is refused and the environment document is left byte-for-byte unchanged.

## Resolution

Do not force the demo migrator over custom observations. Migrate the real project's metrics explicitly to a per-metric units map, or restore the canonical demo environment and rerun make dashboard.

## Emitted by

- `src/project/factory-demo.ts`
