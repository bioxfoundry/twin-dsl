# Cross-layer project integrity

`subactor.project-integrity/v1` audits a complex project as one evidence graph instead of a
collection of independently green subsystems. It is derived deterministically during every
living iteration and published as `project-integrity.json` and `project-integrity.dsl`.

## Layers and dependency chain

The audit covers `requirements`, `research`, `design`, `development`, `runtime`, `twin`,
`scene` and `validation`. It checks explicit transitions between them, including whether the
current scene references the current Twin revision and whether all Twin components reach the
scene and carry addressable evidence.

Four counters are deliberately separate:

- layers with evidence;
- complete and valid dependency links;
- valid parameters;
- grounded assumptions.

`PASS` means no contradiction or invalid parameter was found. `COMPLETE` additionally means
all layers and dependencies are evidenced and no unresolved assumption or missing-evidence
finding remains. Thus `PASS · INCOMPLETE` is expected while a project still contains
conceptual geometry, absent observations or partial validation.

## Findings

Every finding has a stable code, severity, layer and one category:

- `missing-evidence` — a claim or layer cannot yet be verified;
- `ungrounded-assumption` — a fallback is visibly being treated as provisional;
- `invalid-parameter` — a value violates a deterministic constraint;
- `broken-dependency` — the output of one layer does not address the input of the next;
- `inconsistency` — two authoritative artefacts contradict each other.

Each finding points at a `subactor://process/repair/project-integrity/...` URI. This is a
repair proposal address, not executable model output. AQL/OQL and the runtime remain the only
authority that may select and run a process.

## Current deterministic checks

- manager intent and iteration/failure limits;
- finite positions, positive extents and normalized quaternions;
- unique scene paths and valid component references;
- current Twin revision bound to the scene;
- evidence coverage for every semantic layer;
- development and runtime gates;
- Twin components without source URIs;
- conceptual geometry and generation fallbacks;
- physical evidence without a source reference;
- geometry validation result and completeness.

Domain-specific ranges still require explicit contracts. For example, a temperature of
`800 °C` is finite but cannot be called invalid until a process/equipment specification binds
that parameter to a permitted range and unit.
