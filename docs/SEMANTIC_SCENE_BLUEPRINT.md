# Semantic Scene Blueprint

Version 0.5.0 adds an optional `subactor.scene-blueprint/v1` contract for living projects.

## Problem solved

Earlier living-project iterations projected source roles (`customer-knowledge`, `runtime-knowledge`, etc.) directly into 3D. That was useful for observability, but it did not preserve the stable domain identity of a real Digital Twin.

A scene blueprint separates **stable semantics** from **changing evidence and state**:

```text
manager/customer/project/code/runtime sources
                ↓
        resource + evidence graph
                ↓
     semantic scene blueprint
                ↓
 stable Twin component identities
                ↓
 changing properties/source URIs
                ↓
      stable scene bindings
```

## projectDSL

```text
SCENE_FORMAT openusd
SCENE_BLUEPRINT_FILE "baseline/scene-blueprint.json"
```

The blueprint is included in the project configuration hash. Changing it creates a new iteration even if source data has not changed.

## Blueprint component

```json
{
  "id": "build",
  "type": "system-layer",
  "label": "Build / Molecular Construction",
  "sourceRoles": ["customer", "project"],
  "includeDevelopmentEvidence": true,
  "properties": {
    "semanticEvidence": "direct",
    "geometryEvidence": "placeholder"
  }
}
```

At runtime, `sourceRoles` are resolved to the immutable URIs of the current evidence. Development and runtime evidence may be attached without changing the component ID.

## Invariant

A state change may change:

- Twin URI;
- Scene URI;
- source snapshot hash;
- component properties;
- observation values.

It should **not** change semantic component IDs or scene paths unless the blueprint itself changes.

## Matching against an f2md corpus

`pathIncludes` / `pathExcludes` are substring tests over `sourcePath + logicalUri + id + labels`, so
they behave the same on a binary corpus and on the Markdown mirror `f2md --tree` produces: the
mirror keeps the original extension before `.md`, and `lid_UNF.step.md` still contains `step`.

One derived property does **not** survive that translation. `cadAssetCount` / `cadAssets` come from
an end-anchored extension test in `src/scene/blueprint.ts`:

```ts
/\.(step|stp|stl|f3d|scad|glb|usda)$/i.test(r.sourcePath) || /cad|zip-entry/i.test(r.sourcePath)
```

Every file in an f2md tree ends in `.md`, so the first branch never fires and only the literal
substring `cad` in the path can classify an asset. Components whose CAD happens to sit under a
directory named `CAD files` are counted; components whose parts sit elsewhere are not. Measured on
`nanobionic-laboratory-md`: `biospec_bioreactor_01` reports 19 CAD assets, while
`bioprinter_mos3s_01` reports none despite 16 `*.stl.md` parts under `IV. 3D microfluidic
bioprinting/mmc2/`.

Allowing the mirrored suffix — `/\.(step|stp|stl|f3d|scad|glb|usda)(\.md)?$/i` — makes the two
corpora agree. Component identity is unaffected either way; only the reported asset count is.
