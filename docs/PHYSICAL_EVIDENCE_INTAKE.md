# Physical Evidence Intake (`subactor.physical-evidence/v1`)

Replaces placeholder geometry with facts from a floor plan, CAD/IFC model, survey or
equipment register — **without creating a second twin**.

## The contract

```text
componentId  stays the same
scenePath    stays the same
only the physical representation and its provenance change
```

So a component walks

```text
liquid_handler_01
  placeholder → measured → cad → ifc → verified
```

instead of becoming five different liquid handlers.

## Pipeline

```text
IFC / DWG / DXF / PDF plan, equipment register, telemetry, utilities
        ↓
physical-evidence/v1                 (schemas/physical-evidence.schema.json)
        ↓
validation                           unit=m, upAxis=Z, positive extents, no duplicate ids
        ↓
stable component id                  unknown id → rejected, never created
        ↓
position / size / orientation / assetUri
                                      applied to twin properties and scene bindings
        ↓
geometry validation                  tolerances + spatial constraints, deterministic
        ↓
new Twin revision                    evidence is part of the project config hash
        ↓
new Scene revision                   bindings re-point at the new twin content URI
```

## Rules enforced by intake

| Rule | Rejection reason |
| --- | --- |
| The component must already exist in the twin | `UNKNOWN_COMPONENT` |
| The component must be bound in the scene | `COMPONENT_NOT_BOUND_IN_SCENE` |
| Weaker evidence never overwrites stronger geometry | `WEAKER_THAN_EXISTING:<grade>` |
| A mesh/CAD asset must be an ingested resource | `ASSET_NOT_GROUNDED` |
| Orientation must be a normalized `[x,y,z,w]` quaternion | schema validation error |
| Scene pose differs from evidence beyond its tolerance | geometry validation failure |
| `inside`, `clearance` or `no-overlap` is violated | geometry validation failure |
| Nothing to change | `NO_CHANGE` |

Evidence grades are ranked `placeholder < document < measured < cad < ifc < verified`.
Equal-grade records are allowed, so a re-survey can refresh dimensions at the same fidelity.

Free-form `geometryEvidence` strings already present in blueprints (`cad-parts-only`,
`stl-parts`, `archive-inventory`, `document-only`, `n/a`) are normalized onto this scale,
so intake never has to be told about legacy spellings.

Rejections are non-fatal: they are reported and surfaced as
`PHYSICAL_EVIDENCE_REJECTED:<componentId>:<reason>` iteration warnings, and the
pre-existing geometry survives untouched.

## Coordinate system

Only `unit: "m"` and `upAxis: "Z"` are accepted. Convert millimetre CAD **before** intake —
this is deliberate, so a 1000× scale error cannot enter the scene silently. Name the survey
datum in `coordinateSystem.origin`; it is carried onto every touched component as
`geometryOrigin`.

## Pose and spatial constraints

Each record may provide `position`, `size` and `orientation`. Orientation is a normalized
quaternion in canonical `[x,y,z,w]` order; the OpenUSD renderer converts it to USD's
`(w,(x,y,z))` syntax. Per-record `positionToleranceM`, `sizeToleranceM` and
`angleToleranceDeg` make the acceptance threshold explicit instead of hiding it in the
renderer.

The document may also contain deterministic constraints:

- `inside`: the subject's conservative world AABB must fit inside the object's AABB with
  the declared margin;
- `clearance`: the AABB distance must be at least `minDistanceM`;
- `no-overlap`: the two AABBs must not intersect.

World AABBs are computed from oriented boxes. This is intentionally conservative and fast;
it is not an exact mesh/OBB collision test.

## Use from a project

```text
SCENE_BLUEPRINT_FILE           "baseline/scene-blueprint.json"
SCENE_PHYSICAL_EVIDENCE_FILE   "baseline/physical-evidence.json"
```

Both files are part of the project config hash, so new physical facts force a new twin
revision even when sources and code are unchanged.

## Use from the CLI

```bash
# apply evidence to an existing twin/scene pair and render the result
node dist/src/cli/main.js physical-intake <twin.json> <scene.json> <evidence.json> [out-dir]

# render any twin/scene pair to OpenUSD
node dist/src/cli/main.js scene-render <scene.json> <twin.json> [out.usda]
```

`physical-intake` writes `twin.json`, `scene.json`, `scene.usda`,
`physical-evidence.report.json`, `geometry-validation.json` and
`geometry-validation.dsl`. It exits non-zero if a record was rejected or a geometry check
failed.

## Report

```json
{
  "schema": "subactor.physical-evidence-report/v1",
  "applied":  [{ "componentId": "build", "from": "placeholder", "to": "cad", "fields": ["position", "size"] }],
  "rejected": [{ "componentId": "liquid_handler_99", "reason": "UNKNOWN_COMPONENT" }],
  "componentIdsStable": true,
  "scenePathsStable": true
}
```

`componentIdsStable` and `scenePathsStable` are the machine-checkable form of the contract
at the top of this document. `npm run demo:physical` fails the build if either goes false.

The geometry report has two independent decisions:

- `ok`: every check that could be run passed;
- `complete`: every non-scope scene binding has position, size and orientation evidence,
  and the document defines at least one spatial constraint.

Therefore `PASS · INCOMPLETE` is valid and important: supplied facts were translated
correctly, but the scene is not certified as a complete physical twin. The runtime publishes
the same result as typed `GeometryValidationDSL`, including coverage counts and every check.

This validator currently compares scene output with the supplied evidence and evaluates the
declared constraints. It does **not** independently parse dimensions or transforms from the
file named by `sourceRef` (for example an IFC GUID or STEP assembly). Such an importer must
produce the evidence document, including provenance, before this gate can establish agreement
with the external engineering source.

## What to collect first (P0)

Enough to move the facility shell and the Build zone off placeholder:

- floor plan with scale, or IFC / DWG / DXF;
- room names and extents, plus clear heights;
- doors and passages;
- unit and coordinate system (must reduce to metres, Z-up);
- equipment list: `asset_id`, manufacturer, model, width/depth/height, location.

Start from `physical-intake/templates/physical-evidence.template.json`.
Partial data is fine — intake is per component, so one surveyed room is already a
valid revision.
