# Deterministic geometry compilation

## Purpose

The geometry layer materializes executable CAD sources without asking an LLM to invent a
mesh. `f2md` continues to answer *what the source declares*. The geometry compiler answers
*what the declared program produces* and whether that result agrees with independent physical
evidence.

```text
SCAD → Markdown + intentDSL
     → subactor.geometry-build/v1
     → pinned dependencies + OpenSCAD
     → canonical 3MF
     → GLB + USDA
     → subactor.geometry-build-receipt/v1
     → physical-evidence/v1
     → Twin → Scene → OpenUSD/dashboard
```

OpenSCAD's documented CLI exports 3MF but not glTF, which is why 3MF is the canonical
intermediate and the runtime performs the deterministic 3MF → GLB/USD conversion itself:
<https://files.openscad.org/documentation/manual/Using_OpenSCAD_in_a_command_line_environment.html>.
3MF carries an explicit unit and coordinate space; its current specification is published at
<https://3mf.io/spec/>.

## Contracts

`subactor.geometry-build/v1` binds:

- the SCAD source URI and SHA-256;
- pinned dependency revisions, content hashes and logical `OPENSCADPATH` mounts;
- an explicit parameter set and coordinate system;
- the engine version and bounded compiler options;
- stable `componentId` and `scenePath` targets;
- output and validation policy, optionally including an independently hashed reference mesh.

The runtime computes three independent identities:

```text
geometryBuildHash    = source + dependencies + parameters + engine + options + units + outputs
validationPolicyHash = validation rules + reference evidence
geometryArtifactHash = order-independent normalized triangle soup
```

Host checkout paths do not enter `geometryBuildHash`. A validation-policy change reuses the
canonical artifact but cannot reuse an old acceptance result. The semantic artifact hash uses
`subactor.semantic-triangle-soup/v2`, so different vertex/index serialization order does not
make physically identical meshes look different.

`subactor.geometry-build-receipt/v1` records the engine, actual dependency closure, every
artifact hash, triangle count, bounding box, GLB/USD checks, reference comparison, error URN
and authorized repair-process URI. Only a successful receipt can become CAD-grade
`physical-evidence/v1`.

## Execution and autonomy

The TypeScript boundary is `GeometryService`; the OpenSCAD process adapter is intentionally
thin. Dependencies are fetched only from pinned HTTPS Git revisions, checked against their
content hashes and stored in a project-local `.geometry-cache`. The compiler then receives a
temporary copy of the source and libraries through `OPENSCADPATH`. It does not ask OpenRouter
to execute CAD or generate geometry.

The runtime Docker image contains Python, Git and OpenSCAD. A direct local checkout can use
`OPENSCAD_BIN`, a system `openscad`, or the ignored local toolchain at
`.geometry-toolchain/openscad-2021.01/root/usr/bin/openscad`; no privileged system install is
required once that toolchain has been provisioned.

```bash
npm run build
node dist/src/cli/main.js doctor
node dist/src/cli/main.js geometry-build \
  ../nanobionic-laboratory-md-dsl/geometry/lid-unf.geometry-build.json \
  .geometry-build nanobionic-laboratory-md
```

Living projects list contracts in projectDSL:

```text
SCENE_GEOMETRY_BUILD_FILES ["../../nanobionic-laboratory-md-dsl/geometry/lid-unf.geometry-build.json"]
```

The geometry stage runs before evidence is folded into the Twin. A failed build is kept under
`candidate/geometry-builds.{json,dsl}`, blocks scene publication and leaves `current/` as the
last-known-good scene. The same diagnostics are exposed by `/api/state`, `/api/dsl` and the
generated `START.md`.

## Standard error routing

| condition | error URN suffix | repair process |
| --- | --- | --- |
| OpenSCAD absent/version mismatch | `geometry-openscad-backend-required` | `subactor://process/repair/geometry/install-openscad-backend` |
| dependency missing/hash/drift | `geometry-dependency-*` | `subactor://process/repair/geometry/resolve-dependency-closure` |
| source or artifact hash mismatch | `geometry-*-hash-mismatch` | `subactor://process/repair/geometry/refresh-content-hashes` |
| SCAD compile/timeout | `geometry-openscad-*` | `subactor://process/repair/geometry/repair-scad-source` |
| independent geometry disagreement | `geometry-reference-extent-drift` | `subactor://process/repair/geometry/reconcile-source-evidence` |
| malformed/empty/invalid output | `geometry-*` | `subactor://process/repair/geometry/repair-geometry-output` |

Errors are data, not log strings only. `ProjectIntegrityDSL` converts a failed receipt into an
exact cross-layer finding, and `improvementDSL` can propose the matching repair process. The
repair may not silently alter an authoritative CAD source or promote an unvalidated mesh.

## Verified BIO-SPEC lid result (2026-08-08)

The archived `lid_UNF.scad` build established the original disagreement. A reviewed derived source
`geometry/sources/lid_UNF.step-aligned.scad` then completed with OpenSCAD 2021.01:

- 130,216 triangles;
- compiled extent `76.499184 × 76.499592 × 18 mm`, Z=-4…14 mm;
- GLB and USDA generated and load-checked at the available validation level;
- static and runtime dependency closure matched (`threadlib`, `thread_profile`, `scad-utils`,
  `list-comprehension-demos`);
- repeated validation reused the compiled artifact cache.

The independent STEP-derived GLB has extent `76.5 × 76.4762192 × 18 mm`. The repaired result has
zero Z extent difference and a maximum 23.37 µm Y difference caused by independent boundary
tessellation. A reference-only 25 µm policy passes while the internal 3MF→GLB gate remains 1 µm:

```text
REFERENCE_GEOMETRY PASS
EXTENT_DELTA_M 0.00002337282275391428
BUILD_HASH eb6c9537f2a352f6d2ed2c1a9187a4a2446f03eac51e96bfb9bfb8f888577e27
```

The archived source was not overwritten. The derived revision moves the flange to Z=-4…0 and
extends the centre, M12, PG13.5 and UNF through-hole subtractors through Z=-4…14. It has a new
source hash, parameter-set hash, build hash and receipt. The living iteration reused its compiled
artifact from cache and promoted the lid into the active Twin.

Independent-reference extent tolerance is declared on the `REFERENCE` itself. It does not reuse
or weaken `bboxToleranceM`, which remains the strict canonical 3MF → GLB round-trip gate. This is
required because a STEP CAD kernel and OpenSCAD tessellate circular boundaries differently.

## Required regression gates

1. unchanged source/dependencies/parameters → same build hash and compile cache hit;
2. changed parameter or dependency → new build hash, stable component and scene identities;
3. missing dependency, syntax error, timeout or empty mesh → failed receipt, no evidence;
4. 3MF/GLB/USD bbox agreement within explicit tolerance;
5. reference extent disagreement → artifacts retained, publication blocked;
6. identical triangle soup with reordered indices → same semantic artifact hash;
7. successful receipt → GLB resource + CAD evidence + actual OpenUSD reference;
8. failed candidate visible in dashboard DSL logs while `current/` stays unchanged.
