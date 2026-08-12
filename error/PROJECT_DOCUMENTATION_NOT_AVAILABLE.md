---
schema: bioxfoundry.error-page/v1
code: PROJECT_DOCUMENTATION_NOT_AVAILABLE
source: error/catalog.json
generated: true
---

# PROJECT_DOCUMENTATION_NOT_AVAILABLE — Project documentation not available

- Subsystem: `project`
- Severity: `error`
- Error class: `availability`
- Retryable: `true`
- Surfaces: `exception`

## Meaning

The active current/ directory does not contain the accepted artifacts required to describe a Digital Twin project.

## Likely causes

- the project has not completed an accepted trace-enabled iteration
- project.json, resources.json, twin.json, scene.json, analysis-trace.json, geometry-validation.json or project-integrity.json is missing

## Impact

The documentation download cannot be produced; rejected candidate data is not substituted for the missing active revision.

## Resolution

Run one validated project iteration, confirm the required files exist under .living-runtime/current, then retry the export.

## Emitted by

- `src/runtime/project-documentation.ts`
