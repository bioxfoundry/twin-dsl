# Digital Twin detail and render-fidelity audit

Audit date: 2026-08-08  
Audited project: `nanobionic-laboratory-md`  
Dashboard: `http://127.0.0.1:7445/`  
Accepted iteration: `urn:subactor:iteration:sha256:282309472e4d688588e8241e2a3ac4a7e8496e1794a11f9680487b137fe30dac`  
Active Twin: `urn:subactor:twin:sha256:3756572982fef94c16ad0fc0e33484761efa2329f905dedd17019defc00a0379`  
Active Scene: `urn:subactor:scene:sha256:54fd5a861e3cb3a8d2d271f8223216bacc5fc4a970d74859e6d0296d68faab3d`

## Executive verdict

The deterministic runtime, SCAD compiler, content-addressed evidence chain, AssemblyDSL identity
checks and TwinState projection are operational. The active revision is accepted, the current
SCAD build is reproducible, and every generated GLB inspected in the project has a valid GLB 2.0
container.

The displayed result is nevertheless a **low-fidelity validated proxy**, not a detailed live
Digital Twin. The primary bottleneck is no longer document conversion or the LLM. It is the path:

```text
available CAD evidence
  -> unit and coordinate-system contract
  -> assembly-local transforms
  -> Scene asset bindings
  -> hierarchy/material-preserving GLB and USD
  -> renderer feature support
  -> revision-bound visual validation
```

The most urgent defect is more specific than low mesh coverage: the dashboard normalizes each
asset independently along X, Y and Z and stretches it to the Scene binding extent. This hides
mixed source units but can alter physical proportions. The active GL45 binding is affected.

It is not currently justified to claim any of the following:

- a complete BIO-SPEC or MOS3S assembly;
- metrically faithful rendering of every bound mesh;
- material-faithful or PBR rendering;
- complete OpenUSD geometry composition;
- shape-level equivalence between most CAD sources and rendered assets;
- fresh real-time equipment telemetry;
- presentation PNG/WebM files that certify the latest accepted revision.

## Measured snapshot

### Runtime and coverage

| Metric | Observed | Interpretation |
| --- | ---: | --- |
| Twin components, flattened | 44 | Semantic model is richer than the rendered scene. |
| Scene bindings | 30 | Includes physical objects and logical/cyber display markers. |
| Scene bindings with `assetUri` | 2/30 (6.67%) | One runtime-compiled lid and one precompiled GL45 asset. |
| Primitive fallbacks | 28/30 (93.33%) | Visible result is dominated by proxy geometry. |
| Precompiled library GLBs used by the active Scene | 1/23 (4.35%) | GL45 is used; the second active mesh comes from the runtime SCAD build. |
| Complete assemblies | 0/2 | Both device assemblies remain incomplete. |
| Complete required parts | 2/17 (11.76%) | Identity exists, but most parts are not rendered in their assembly. |
| Grounded required-part assets | 16/17 (94.12%) | The missing contract entry is not the same as a missing file. |
| Placed required parts | 3/17 (17.65%) | Fourteen MOS3S parts have no Scene binding/transform. |
| Required spatial checks passed | 15/99 (15.15%) | `PASS / INCOMPLETE`, not full geometry certification. |
| Position evidence | 7/33 (21.21%) | Physical/hybrid components only. |
| Size evidence | 8/33 (24.24%) | Physical/hybrid components only. |
| Orientation evidence | 0/33 | Every displayed orientation is non-authoritative. |
| Fresh TwinState bindings | 0/3 | All three resolved values are expired. |

The global `2/30` metric is useful as an honest description of the current image, but it should
not become the final quality SLA. Some scene entries are intentional logical markers. The runtime
needs an explicit `meshEligible`/`representationPolicy` classification and should calculate the
target over physical equipment and required assembly parts only.

### CAD conversion and GLB structure

The batch tessellation report contains 31 source records:

- 16/16 STL sources converted;
- 7/7 STEP sources converted;
- 0/7 F3D sources converted (`CAD_TESSELLATOR_BACKEND_REQUIRED:.f3d`);
- the archived SCAD source failed in the old batch path, while the separate deterministic
  `SCAD -> 3MF -> GLB/USDA` runtime path now succeeds.

There are 23 precompiled GLBs in `nanobionic-laboratory-md-dsl/assets/geometry`. All 23 have valid
GLB 2.0 headers and JSON chunks. Together they contain 351,260 triangles. Increasing the 130,216
triangle lid mesh would therefore be a poor next investment.

The structural inspection of those 23 GLBs found:

| GLB feature | Coverage |
| --- | ---: |
| Valid containers | 23/23 |
| Normal attributes | 23/23 |
| Named nodes | 0/23 |
| More than one node/mesh/primitive | 0/23 |
| Indexed primitives | 0/23 |
| Tangents | 0/23 |
| UV coordinates | 0/23 |
| Materials | 0/23 |
| Textures/images | 0/23 |
| Animations/skins | 0/23 |
| Declared glTF extensions | 0/23 |

The files are valid triangle containers, but they are not hierarchy-, material- or
feature-preserving equipment representations.

### OpenUSD and presentation

The active `scene.usda` contains two `subactor:assetUri` values but only one actual USD reference:
the runtime-compiled lid. The GL45 GLB is provenance metadata in USD, not composed mesh geometry.
Independent `pxr.Usd.Stage.Open` validation is unavailable (`ModuleNotFoundError: pxr`), so the
geometry receipt correctly records `usdStageOpen=false` and `usdValidationAvailable=false`.

The presentation files decode, but they are not bound to the latest revision. The dashboard PNG
and recording were captured at approximately 20:23Z and show active revision `04728d...`; the
currently accepted iteration completed at 21:00Z with Twin revision `375657...`. The older orbit
and live recordings are earlier still. A file under `current/presentation/` is therefore only the
last captured visual, not proof of the current Scene.

## What is already correct

- The active/candidate boundary is explicit and the dashboard renders the accepted scope.
- Assembly identity and parent checks pass. `assembly-report.ok=true` while
  `assembly-report.complete=false`, which is the correct fail-visible result.
- The current SCAD receipt is successful and cacheable: dependency closure is closed, GLB loads,
  the mesh is finite and non-empty, and the independent STEP extent comparison passes.
- `componentId` and `scenePath` remain stable when the lid representation changes.
- Expired observations remain auditable but project to `unknown`; they are not presented as
  current telemetry.
- Binary STL loading is bounds-checked, and the previously reported `DataView` out-of-bounds
  exception is no longer reproduced by the current GLB-first loader.

These properties should be preserved while improving fidelity.

## Findings and repair routing

### P0 — physical correctness and existing-asset use

#### DTQ-UNIT-001 — mixed units are hidden by destructive normalization

Error URN: `urn:subactor:error:detail:asset-unit-contract-missing`  
Repair process: `subactor://process/repair/geometry/normalize-unit-and-coordinate-system`

`run_stl()` and `run_step()` write input coordinates directly to GLB. STEP is first converted to
STL, so STEP hierarchy and explicit unit metadata are lost. The SCAD/3MF path, by contrast,
converts coordinates to metres before writing GLB.

The dashboard's `normalizeAssetMesh()` independently maps every axis to `[-0.5, 0.5]` and then
scales it to `binding.size`. This makes mixed-unit assets appear renderable but delegates physical
truth to the Scene proxy size and can change aspect ratio.

Observed GL45 asset extent is `39.5 x 39.487724 x 13` source units. The active Scene extent is
`0.5 x 0.5 x 0.4 m`. With the project CAD convention of millimetres, the display factors are
approximately `12.66x`, `12.66x` and `30.77x`; Z is distorted relative to X/Y.

Required correction:

1. emit metres in every web GLB, with source unit/up-axis/handedness in a build receipt;
2. derive Scene size from the validated asset bounding box unless stronger physical evidence
   explicitly overrides it;
3. apply a unit-aware transform without per-axis geometry normalization;
4. reject unexplained asset/Scene extent disagreement instead of stretching it.

#### DTQ-BIND-001 — materialized assets are not bound into the Scene

Error URN: `urn:subactor:error:detail:materialized-asset-unbound`  
Repair process: `subactor://process/repair/digital-twin/bind-grounded-assets`

Only one of the 23 precompiled library GLBs is used by the active Scene. Fourteen MOS3S assets are
already grounded by AssemblyDSL, but their part components have no Scene bindings. Tessellating
the same source again cannot improve this metric.

The current diagnostic routes all 28 fallbacks to both `bind-grounded-assets` and
`tessellate-cad-to-gltf`. That is too broad. The repair loop must first distinguish:

```text
source absent
  != source present but conversion absent
  != asset materialized but unbound
  != asset grounded but unplaced
  != intentional proxy
```

#### DTQ-ASSEMBLY-001 — AssemblyDSL has identity but no geometric tree

Error URN: `urn:subactor:error:detail:assembly-transform-tree-incomplete`  
Repair process: `subactor://process/repair/assembly/derive-local-transform-tree`

The current AssemblyDSL part contract contains `componentId`, optional `assetUri`, optional
`scenePath` and `required`. It has no local transform, parent part, coordinate system, joint or LOD.
Fourteen MOS3S assets are correctly identified but cannot be assembled deterministically.

The next contract must support parent-relative transforms. Source STL bounding boxes contain
heterogeneous offsets, but there is no receipt proving that every file shares one assembly origin.
The runtime must not infer a complete printer by stacking parts at a guessed centre.

#### DTQ-ASSET-001 — aluminium plate is reported missing although a GLB exists

Error URN: `urn:subactor:error:detail:assembly-asset-declaration-missing`  
Repair process: `subactor://process/repair/assembly/bind-existing-asset`

`aluminium_plate.step.glb` is present, valid and ingested as
`urn:subactor:resource:sha256:5a3a46be92c1b9dd5ac730d99bf467acc76f2192ed583c01555df9e0c5b1857f`.
The `aluminium_plate` AssemblyDSL part does not declare it, so the assembly report emits
`ASSEMBLY_PART_ASSET_MISSING` and the Scene keeps a cube. This is a binding defect, not a CAD
conversion defect.

#### DTQ-SCENE-001 — device parts are absent from Scene composition

Error URN: `urn:subactor:error:detail:required-parts-not-composed`  
Repair process: `subactor://process/repair/scene/compose-assembly-parts`

The Twin contains the 14 MOS3S part identities as children of `bioprinter_mos3s_01`, but the Scene
contains only the root device proxy. A part can be grounded without being visible; assembly
composition must add stable part paths and parent-relative transforms without replacing the root
device identity.

### P1 — exporter, renderer and validation fidelity

#### DTQ-EXPORT-001 — STEP and 3MF are flattened to one unnamed triangle soup

Error URN: `urn:subactor:error:detail:cad-hierarchy-flattened`  
Repair process: `subactor://process/repair/geometry/export-hierarchical-gltf`

`run_step()` imports STEP through CadQuery, exports a temporary STL and then calls `run_stl()`.
`read_3mf()` also flattens component objects before GLB creation. `write_glb()` always emits one
unnamed node, one mesh and one non-indexed primitive. Assembly nodes, face groups, colours and
source names cannot survive this path.

The canonical geometry hash may continue to use normalized triangle soup, but the render artifact
must preserve a richer graph. Hash identity and presentation structure are separate concerns.

#### DTQ-NORMAL-001 — flat normals and incorrect normal transformation

Error URN: `urn:subactor:error:detail:surface-normal-policy-missing`  
Repair process: `subactor://process/repair/geometry/rebuild-normals-and-tangents`

The converter duplicates every triangle vertex and assigns one face normal, so curved CAD surfaces
remain faceted. There is no hard/smooth edge policy. The vertex shader transforms normals with
`mat3(uModel)` instead of an inverse-transpose normal matrix; this is incorrect under the
non-uniform scales used by Scene bindings.

#### DTQ-MATERIAL-001 — physical material and evidence colour are conflated

Error URN: `urn:subactor:error:detail:physical-material-missing`  
Repair process: `subactor://process/repair/material/bind-grounded-pbr-material`

None of the 23 GLBs contains a material. The renderer replaces material appearance with evidence
grade colour. Evidence grade is useful as an overlay, but it cannot represent stainless steel,
glass, ABS, tubing or aluminium. MaterialEvidenceDSL and a separate diagnostic overlay are needed.

#### DTQ-RENDER-001 — the GLB loader supports only a private minimal subset

Error URN: `urn:subactor:error:detail:renderer-gltf-feature-unsupported`  
Repair process: `subactor://process/repair/renderer/implement-scene-graph-gltf`

The loader reads only `meshes[0].primitives[0]`, ignores node transforms and indices, and does not
support multiple primitives, materials, textures, transparency, double-sided flags, animations or
skins. Lighting is one fixed Lambert-like direction plus a constant term. There are no shadows,
environment light, ambient occlusion, tone mapping or material-aware passes. Culling is disabled,
and a unit-box outline is drawn around every object, including arbitrary mesh assets.

Renderer upgrades must follow the exporter upgrade; otherwise the richer GLB would be silently
reduced back to its first primitive.

#### DTQ-QA-001 — geometry `PASS` is spatial-subset pass only

Error URN: `urn:subactor:error:detail:shape-quality-validation-missing`  
Repair process: `subactor://process/repair/geometry/add-shape-level-quality-gates`

The active geometry report uses `method=world-aabb`. It validates supplied position, size and AABB
constraints; it does not inspect manifoldness, degenerate faces, winding, connected components,
volume, surface area, Hausdorff/Chamfer distance or semantic features such as port count. There are
no failed checks because only 15 supplied checks ran. `ok=true` and `complete=false` is internally
consistent, but must never be summarized as complete model correctness.

The SCAD lid reference check compares extents, not full surface distance. Two different shapes can
pass an extent-only comparison.

#### DTQ-USD-001 — OpenUSD contains only one real geometry reference

Error URN: `urn:subactor:error:detail:openusd-geometry-composition-incomplete`  
Repair process: `subactor://process/repair/openusd/materialize-and-reference-assets`

The lid is referenced as USDA. GL45 has only `custom asset subactor:assetUri`, so a USD consumer
does not receive its mesh. Other required parts are absent. Add USDC/USD assets for every accepted
geometry representation and validate the composed stage with PXR.

#### DTQ-LIVE-001 — semantic state exists but no fresh live equipment state is visible

Error URN: `urn:subactor:error:detail:live-state-freshness-zero`  
Repair process: `subactor://process/repair/live-twin/connect-fresh-observation-source`

Three LiveBindingDSL entries resolve, but all are expired. None represents active bioreactor,
pump, printer or environmental telemetry. Behavior/Visual projection is still not applied to
geometry. This does not cause the low polygonal detail, but it prevents the result from being a
live behavioural twin.

#### DTQ-PRESENTATION-001 — visual artifacts are stale and have no revision receipt

Error URN: `urn:subactor:error:detail:visual-artifact-revision-drift`  
Repair process: `subactor://process/repair/visual-qa/capture-active-revision`

PNG/WebM files are copied under `current/presentation`, but the existing captures have no manifest
binding their content hash, camera, renderer version, Twin URI and Scene URI. The runtime now
detects this deterministically: it validates `subactor.presentation-evidence/v1`, re-hashes every
declared capture, requires a static/orbit camera description, emits JSON + PresentationEvidenceDSL,
adds a ProjectIntegrity warning and marks the files historical/unverified in `START.md`. Automatic
per-revision capture and camera provenance for the existing files are still missing; until they
exist, only a manifest-backed capture may become `CURRENT`.

#### DTQ-DIAG-001 — expected binary stubs are reported as generation failures

Error URN: `urn:subactor:error:detail:diagnostic-domain-misclassification`  
Repair process: `subactor://process/repair/diagnostics/split-semantic-and-geometry-status`

The generation audit contains 26 `BINARY_STUB:EXTERNAL_CONVERTER_REQUIRED` warnings, including GLB,
STL and STEP resources that are intentionally opaque to semantic text extraction or already have
geometry artifacts. Routing this aggregate to `rerun-generation` is not actionable. Semantic
extraction status, CAD materialization status and Scene binding status need separate diagnostics.

Resolved in runtime generation `2026-08-09.evidence-ranked-diagnostics-v1`: archive informational
findings and binary-content observations are now non-blocking notices, binary bytes retain their
own resource hash, and the two remaining backend warnings carry their exact repair processes.
Physical diagnostics also exclude logical/cyber display markers and distinguish measured/CAD/IFC
extent proxies from genuinely conceptual physical geometry.

### P2 — scalable detail and inspection

#### DTQ-LOD-001 — no explicit LOD or representation policy

Error URN: `urn:subactor:error:detail:geometry-lod-contract-missing`  
Repair process: `subactor://process/repair/geometry/derive-lod-policy`

The runtime currently chooses between a primitive and one mesh. Add GeometryLODDSL only after the
unit, hierarchy and binding defects are fixed. LOD must preserve one `componentId` and stable Scene
path while selecting bounding, simplified, operational or inspection representations.

#### DTQ-FEATURE-001 — documentation detail is not converted into checkable visible features

Error URN: `urn:subactor:error:detail:visible-feature-contract-missing`  
Repair process: `subactor://process/repair/detail/derive-evidenced-feature-contract`

The project documentation describes ports, vessels, heads, plates, connectors and other visible
features, but no DetailDSL/FeatureDSL gate checks those facts against geometry. An LLM may propose
feature requirements from Markdown; deterministic CAD analysis or explicit evidence must validate
them.

#### DTQ-CAMERA-001 — overview camera hides inspection detail

Error URN: `urn:subactor:error:detail:inspection-view-contract-missing`  
Repair process: `subactor://process/repair/visual-qa/add-evidenced-camera-suite`

The dashboard has one orbit camera fitted to the whole facility. Add Overview, Assembly, Component
and Inspection camera contracts with fit-to-bounds and stable parameters. Screenshot regression
then becomes reproducible rather than dependent on manual orbit state.

#### DTQ-F3D-001 — Fusion 360 sources remain unsupported

Error URN: `urn:subactor:error:detail:f3d-backend-unavailable`  
Repair process: `subactor://process/repair/geometry/select-authoritative-cad-backend`

All seven F3D records fail in the batch converter. Sibling STEP files cover their current shapes,
so this is not the immediate cause of the 28 fallbacks. It may still discard Fusion-specific
assembly, parameter and material information and should be resolved through an explicit backend or
a documented STEP-as-authority policy.

## Required DSL contracts

### Assembly tree extension

The existing AssemblyDSL package should remain responsible for stable part identity and
completeness. Extend it with local geometry placement rather than adding OpenSCAD logic to the
living runtime:

```assemblydsl
ASSEMBLY bioprinter-mos3s
ROOT bioprinter_mos3s_01
KIND device
COORDINATE_SYSTEM UNIT millimeter UP Z HANDEDNESS right

PART carriage COMPONENT bioprinter_part_carriage REQUIRED true
PARENT frame
ASSET urn:subactor:resource:sha256:...
LOCAL_TRANSLATION 84.2513 410.1228 76.5
LOCAL_ROTATION 0 0 0 1
JOINT linear_y
END_PART
END_ASSEMBLY
```

Values above are illustrative syntax, not approved placement evidence. A source receipt must
authorize them before publication.

### Detail and quality projection

```detaildsl
DETAIL_COVERAGE nanobionic-laboratory-md
SCENE_BINDINGS 30
MESH_BINDINGS 2
PRIMITIVE_FALLBACKS 28
REQUIRED_PARTS 17
COMPLETE_REQUIRED_PARTS 2
PLACED_REQUIRED_PARTS 3
TARGET_PHYSICAL_MESH_COVERAGE 0.80
RESULT FAIL
END_DETAIL_COVERAGE

COMPONENT biospec_bioreactor_01
EVIDENCE_LEVEL cad
GEOMETRY_QUALITY Q1
MATERIAL_QUALITY Q0
ASSEMBLY_QUALITY Q1
PLACEMENT_QUALITY Q1
LIVE_QUALITY Q0
END_COMPONENT
```

Suggested levels:

```text
Q0 missing
Q1 proxy
Q2 approximate
Q3 production
Q4 independently verified
```

Evidence grade and render quality must remain independent. A CAD source can be authoritative while
its current Scene representation is still Q1.

## Package boundaries

Do not add the following logic directly to `LivingProjectRuntime` or the dashboard page:

| Package | Responsibility | Must not own |
| --- | --- | --- |
| `js/assembly-dsl` | identity, part tree, local transforms, joints, completeness | CAD subprocesses, WebGL |
| `js/detail-dsl` | visible features, LOD intent, quality ladder, coverage policy | mesh generation |
| `js/material-dsl` | grounded physical material evidence and diagnostic overlays | renderer implementation |
| `py/cad-compiler` | STL/STEP/3MF/SCAD/F3D adapters, units, hierarchy-preserving GLB/USD | Twin authority decisions |
| `js/geometry-quality` | GLB/USD structure, topology and reference metrics | document interpretation |
| `js/scene-projection` | Assembly + Physical Evidence -> Scene graph | LLM calls, CAD compilation |
| `js/gltf-renderer` | supported glTF scene graph and PBR projection | evidence authority |
| `js/visual-qa` | deterministic cameras, screenshots, revision receipts, regression metrics | Twin mutation |

The current zero-dependency AssemblyDSL and LiveBinding/TwinState packages are good precedents.
File contracts remain the cross-language boundary.

## Implementation sequence and acceptance gates

### Stage 0 — stop geometric misrepresentation

1. add unit/up-axis/handedness receipts for every converted asset;
2. remove implicit per-axis normalization from authority rendering;
3. derive or validate Scene extents from artifact bounds;
4. add a GL45 regression that fails on the current `0.5 x 0.5 x 0.4 m` proxy size.

Acceptance:

- 100% of mesh assets have explicit coordinate-system metadata;
- asset-to-scene extent delta is within declared tolerance;
- no renderer path changes an asset's aspect ratio without an explicit transform.

### Stage 1 — use the geometry already available

1. bind the existing aluminium plate asset;
2. add authoritative parent-relative transforms for all 14 MOS3S parts;
3. compose parts under stable assembly paths;
4. split placeholder diagnostics into missing, unbound, unplaced and intentional-proxy cases.

Acceptance:

- grounded required-part assets: 17/17;
- placed required parts: 17/17;
- complete assemblies: 2/2;
- physical mesh coverage: at least 80% over explicitly mesh-eligible components;
- no single part certifies its parent device as complete.

### Stage 2 — preserve CAD structure and material evidence

1. replace STEP-to-temporary-STL flattening with a hierarchy-aware exporter;
2. emit indexed geometry, named nodes, multiple primitives and source face groups;
3. implement hard/smooth normal policy and correct normal matrices;
4. add MaterialEvidenceDSL and PBR material export.

Acceptance:

- a two-part/two-material fixture round-trips with node names and transforms intact;
- indexed mesh coverage is 100% for new assets;
- normals, tangents and required UVs pass deterministic checks;
- evidence overlay can be toggled without changing physical material.

### Stage 3 — shape and visual quality gates

1. add topology, volume, surface area and connected-component checks;
2. add Hausdorff/Chamfer comparison where a reference mesh exists;
3. add deterministic feature checks such as port/hole count;
4. validate composed USD with PXR;
5. capture overview/assembly/component/inspection images with revision receipts.

Acceptance:

- `pxr.Usd.Stage.Open` and default-prim checks pass in CI/runtime;
- visual artifacts name and hash the exact Twin URI, Scene URI, camera and renderer version;
- `START.md` marks missing/stale/unverified presentation evidence instead of linking it as current
  (implemented; automatic capture remains open);
- screenshot regression failures remain diagnostic signals unless an explicit visual authority gate
  promotes them.

### Stage 4 — live behaviour

1. connect at least one fresh observation source to real equipment identity;
2. project ObservationDSL through LiveBindingDSL into TwinState;
3. add BehaviorDSL and VisualDSL projections without putting domain thresholds in WebGL;
4. stream TwinState changes after the event contract is stable.

Acceptance:

- at least one physical device has fresh, TTL-governed state;
- stale/expired values cannot drive a nominal visual state;
- the same TwinState feeds 3D, dashboard, alarms and tests.

## Minimum regression suite

1. every source STL and STEP has a conversion receipt and a loadable target;
2. a declared source unit produces the same metric bounds in GLB and USD;
3. unit mismatch and anisotropic implicit fit fail closed;
4. every required AssemblyDSL asset resolves in the ingested resource set;
5. every required placed part has a stable part Scene path and parent-relative transform;
6. multi-node, multi-primitive and multi-material GLB fixtures render completely;
7. non-uniform scale uses an inverse-transpose normal matrix;
8. manifold, degenerate-face, winding and connected-component checks emit stable URNs;
9. reference surface distance and semantic feature counts are within declared tolerances;
10. PXR opens the composed stage and resolves every accepted geometry reference;
11. screenshot/video receipts match the active Twin and Scene URIs;
12. detail coverage regressions create a repair ticket instead of silently increasing tessellation;
13. expired telemetry projects to `unknown` and cannot animate nominal equipment state;
14. LLM output cannot alter a mesh, material or transform without a deterministic receipt.

## Final priority decision

The next iteration should not increase tessellation of the lid and should not ask OpenRouter to
"make the model more detailed". It should:

```text
fix units and aspect fidelity
  -> bind already materialized parts
  -> establish authoritative assembly-local transforms
  -> preserve hierarchy and materials in GLB/USD
  -> upgrade renderer support
  -> add shape and visual regression gates
```

That sequence addresses both physical correctness and the visible lack of detail while preserving
the project's existing deterministic authority boundaries.

## Verified implementation update — 2026-08-08

The first high-value archive candidate has now crossed the complete evidence path. The OSCAR
pipette-tool ZIP yielded a 414,007-vertex, 412,076-triangle OBJ with 38 groups and 38 MTL
materials. The deterministic converter emits a 14,899,972-byte indexed multi-material GLB, and
the dashboard renders every primitive in an isolated inspection view.

Measured improvement in the accepted current revision:

| Metric | Before | Current |
|---|---:|---:|
| scene bindings | 30 | 31 |
| real mesh bindings | 2 | 3 |
| unique meshes | 2 | 3 |
| complete assemblies | 0/2 | 1/3 |
| complete required parts | 2/17 | 3/18 |

This does not close the full detail gap: 28 scene objects still use primitive fallbacks and the
MOS3S part set lacks authoritative assembly-local transforms. The result does validate the intended
method: inspect ZIP structure, recover a complete asset, preserve materials, bind it to the correct
child identity, apply Physical Evidence, validate AssemblyDSL, publish current, and capture an
inspection artifact. Full archive details are in
[`ARCHIVE_PROJECT_EXTRACTION.md`](ARCHIVE_PROJECT_EXTRACTION.md).
