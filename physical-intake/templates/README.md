# Filling in `physical-evidence.template.json`

Contract and rejection rules: [`docs/PHYSICAL_EVIDENCE_INTAKE.md`](../../docs/PHYSICAL_EVIDENCE_INTAKE.md).
Schema: [`schemas/physical-evidence.schema.json`](../../schemas/physical-evidence.schema.json).

| Field | Meaning |
| --- | --- |
| `componentId` | Must already exist in the twin. Unknown ids are rejected, never created. |
| `kind` | `space`, `equipment` or `utility`. |
| `evidence` | `placeholder` < `document` < `measured` < `cad` < `ifc` < `verified`. A weaker grade never overwrites a stronger one. |
| `position` | `[x, y, z]` centre of the object in metres, relative to `coordinateSystem.origin`. |
| `size` | `[x, y, z]` extents in metres, all strictly positive. |
| `assetUri` | Optional. Must be a resource URI already ingested into the project corpus, otherwise `ASSET_NOT_GROUNDED`. |
| `sourceRef` | Where the fact came from: IFC GUID, drawing sheet, survey report, register row. |
| `properties` | Free-form, merged onto the twin component (manufacturer, model, asset id, clear height…). |

List the ids you can target:

```bash
jq -r '.components[].id' <path-to>/twin.json
```

**Delete any record you have no measurement for.** Partial intake is valid — one surveyed
room is already a useful revision. Do not invent dimensions; a placeholder left as a
placeholder is honest, a guessed number is not.

Millimetre CAD must be converted to metres before intake: only `unit: "m"` / `upAxis: "Z"`
is accepted, so a 1000× scale error cannot enter the scene silently.

Validate before committing:

```bash
node dist/src/cli/main.js physical-intake <twin.json> <scene.json> physical-evidence.json .physical-intake
```
