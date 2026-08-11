---
schema: bioxfoundry.error-page/v1
code: FACTORY_DEMO_TARGET_INVALID
source: error/catalog.json
generated: true
---

# FACTORY_DEMO_TARGET_INVALID — Factory demo target invalid

- Subsystem: `factory`
- Severity: `error`
- Error class: `configuration`
- Retryable: `false`
- Surfaces: `exception`

## Meaning

The factory-demo bootstrap script was asked to operate outside the repository's generated .factory-demo/project directory.

## Likely causes

- a custom path was supplied to scripts/ensure-factory-demo.mjs
- the script was invoked as a general project migrator

## Impact

The script exits before reading or writing the requested directory.

## Resolution

Run the script without a custom target for the generated demo. Migrate real projects with their explicit project workflow instead of the demo bootstrap.

## Emitted by

- `src/project/factory-demo.ts`
