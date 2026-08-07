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
