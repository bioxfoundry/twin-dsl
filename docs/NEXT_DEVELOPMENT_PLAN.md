# Development plan after `twin-dsl` 0.5.34

- Reference date: 2026-08-10
- Reference project: `nanobionic-laboratory-md`
- Document type: execution plan; not a confirmation of the work described below being completed.

## Goal

Subsequent iterations should primarily improve the reliability of input and evidence, and only then
the visual effect. The target workflow should:

1. demonstrate the fate of each configured document and asset;
2. generate a deterministic baseline DSL with full provenance;
3. use LLM exclusively to produce validated `patchDSL`;
4. bind geometry, state, and presentation to a single accepted revision;
5. detect `ERROR`, perform limited repairs, and restart gates;
6. not present missing data, a skipped test, or an old artifact as a passed result.

## Verified starting point

| Area | Status after iteration 0.5.34 |
| --- | --- |
| Publication | `twin-dsl` 0.5.34 and `diagnose-agent` 0.1.9 published |
| Project revision | `f63f23b2-2bde-4588-b7fe-cacf29ffdcb3`, `validation.ok=true` |
| Repetition | `noChange=true`, no second publication of the same content |
| Local gate | 0 errors and 0 skipped steps |
| LLM boundary | 5 transports, 3 consumers, 12 contracts, 0 errors |
| Assembly | 3/3 complete assemblies, 18/18 required parts |
| Scene | 45 bindings, 18 asset bindings, and 18 unique GLBs |
| GLB via dashboard | 18/18: HTTP 200, GLB v2 and SHA-256 consistent with URN |
| Spatial evidence | 64/102 required checks |
| Project integrity | 3 warnings and 7 explicit assumptions |
| Presentation | 8 historical files, `UNVERIFIED`, no manifest and camera data |

The current three warnings are a correct validation result, not a runtime failure:

- `CONCEPTUAL_GEOMETRY_ASSUMPTION`: seven objects use conceptual geometry;
- `GEOMETRY_VALIDATION_INCOMPLETE`: 12 position, 8 size, and 18 orientation checks are missing;
- `PRESENTATION_EVIDENCE_UNVERIFIED`: existing dumps do not prove active revision.

## Architectural principles

### One responsibility per project

| Project | Responsibility owner | What it should not implement |
| --- | --- | --- |
| `f2md` / `research-agent` | source conversion, Markdown, hashes and provenance | SSOT, authority, rendering and patch execution |
| `doDSL` | Git/web/upload intake, compiler orchestration and SSOT candidate creation | own `t2c.intent` compiler, SSOT promotion and LLM command execution |
| `todo2code` | Intent Evidence, Intent vs Reality, code diagnostics, and change proposals | CAD, rendering, SSOT promotion, and automatic patch application |
| `onlyDSL` | IFURI, authority, accepted SSOT, candidate and promotion | CAD conversion, Twin/Scene build and source parser duplication |
| `twin-dsl` | Resource/Tree/Math/Observation/Twin/Scene, geometry, and rendered revision | an alternative SSOT, an alternative `todo2code`, or an unrestricted LLM executor |
| `diagnose-agent` | deterministic detection and stable error codes | modifying the project |
| `repair-agent` | mechanical strategies and controlled `patchDSL` proposals | guessing proofs, transformations, and automatic LLM approval |

Integration is to be done via versioned files and URIs. Library import is only allowed
for a small, independently released contract package. Schemas should not be copied to another
repository or maintain a second parser of the same DSL.

### The only permitted LLM role

Every context passed to the model must contain JSON Schema and GBNF. The executable response
is exclusively `patchDSL` associated with the hash of the base document:

```text
evidence + deterministic base DSL
  -> LLM(schema + GBNF)
  -> patchDSL(baseHash, evidenceUris, operations)
  -> schema, hash, URI, and allowed-path validation
  -> deterministic application to the candidate
  -> tests and validation
  -> explicit promotion
```

Model prose can be advice, but never executor input. An incorrect response, timeout, or lack of
model should leave the base DSL unchanged. In the developer profile, a local apply flag is sufficient,
an isolated directory, patch hash, path allowlist, and receipt; a cryptographic mutation grant is not
required. The production profile remains a separate, more restrictive policy.

## Order of execution

| Order | Proposed release | Result |
| ---: | --- | --- |
| 1 | 0.5.35 | unambiguous dependency versioning and `SourceCoverageDSL` for all inputs |
| 2 | 0.5.36 | fresh, revision-linked presentation evidence with camera parameters |
| 3 | 0.5.37 | classification of representations and closing missing geometry evidence |
| 4 | 0.5.38 | limited loop `diagnose -> repair -> verify -> iterate -> report` |
| 5 | after stabilization | vertical integration `doDSL -> onlyDSL -> twin-dsl` via file artifacts |

Release numbers are proposals. Each release should have one main goal and be deployable without
waiting for the next one.

## Stage 1 — full accounting of sources and dependencies

### 1.1 `SourceCoverageDSL`

`research-agent` or `f2md` should emit `source-coverage.json` and
`source-coverage.dsl`. Each detected input element must have exactly one final state:

```text
converted
binary-provenance
excluded-by-policy
unsupported
quarantined
failed
```

The record should contain at least:

- logical path, type, and SHA-256 of the source;
- path of the derived Markdown, if created;
- `resourceUri`, intent URIs, and TreeDSL references;
- converter ID and its version;
- final state and stable reason code;
- information on whether the element entered an active Twin revision.

`twin-dsl` is to consume this report, not recreate it. In `ProjectIntegrityDSL`, distinguish:

- source undetected;
- detected but not converted;
- binary with correct provenance;
- converted, but not linked to the tree;
- linked, but not used by Twin.

Kryteria akceptacji:

- 100% of configured inputs have an explicit final state;
- sum of states equals the number of detected inputs;
- no silent omission or `skipped` presented as `passed`;
- changing one document changes only its hashes and dependent URIs;
- a second unchanged run produces an identical report and `noChange=true`.

### 1.2 Pinning dependencies by Git identity

The canonical `semcod/todo2code` checkout is in one location:

```text
/home/tom/github/semcod/todo2code -> 2380dd8b2f7d...
```

Version number is still not enough. Receipt development should record `remote`, full commit,
`packageVersion`, schema hash, and executable hash. If the configuration points to a checkout
with a different commit or schema than the pinned identity, `doctor` should return an explicit configuration error.

The same rule should apply to `onlyDSL`, `doDSL`, `f2md`, and the `twin-dsl` vendor. The proposed
`dependency-lock.json` should be generated from actually run tools, not manually from README.

## Stage 2 — proof of active revision presentation

Existing eight files should not be given a new manifest. We do not know their exact camera and
they do not represent an active revision.

A controlled capture command should be added that:

1. reads the accepted `twinUri`, `sceneUri`, and `iterationUri`;
2. sets a static camera or records a deterministic orbit trajectory;
3. saves PNG/WebM and `eye`, `target`, `up`, FOV parameters, and trajectory hash;
4. calculates file hashes after saving is complete;
5. atomically saves `presentation/manifest.json` compliant with the schema;
6. restarts inspection and publishes `CURRENT` status only upon full compliance.

Negative tests must include a changed image, a different scene, an unknown camera, a missing file, a change in
trajectory, and an attempt to exit the path outside the presentation directory.

Acceptance criterion: `PRESENTATION_EVIDENCE_UNVERIFIED` disappears only after a new capture for the
current revision. The next scene change automatically changes the status to `STALE`.

## Stage 3 — geometry that matters physically

The current 18 GLBs are technically correct. The next goal is not to increase the number of triangles,
but proving representation, transformations, and units.

### 3.1 Representation classification

Each binding should have a deterministic `representationPolicy`:

```text
logical-marker
conceptual-proxy
measured-proxy
mesh-required
mesh-preferred
```

This will prevent the mesh coverage indicator from counting logical markers as CAD defects.
`conceptual-proxy` remains a warning or an explicitly accepted assumption, never full proof.

### 3.2 Closure of the 102 control matrix

Work sequence for each physical component:

1. existing asset and its provenance;
2. unit, coordinate system, handedness, and up axis;
3. size from an asset or stronger measurement;
4. parent-relative position and orientation from an authoritative source;
5. independent tolerance validation;
6. only then binding to the scene.

Missing data must create an `EvidenceGapDSL` or equivalent existing contract with a reason code. Not
allowed to arrange parts based on the bounding box center or stretch each axis to proxy size.

Kryteria akceptacji:

- seven conceptual geometries receive evidence or remain an explicit, named exception;
- the 64/102 counter increments after each data packet and never through guessed data;
- the `COMPLETE` target requires 102/102 actual checks;
- `componentId` and `scenePath` remain stable when representation changes;
- an independent HTTP test still confirms GLB v2 and the hash of each active asset.

PBR materials, hierarchical STEP/OpenUSD, and animations are the next step only after correct
units and transformations.

## Stage 4 — constrained autonomous repair

The current `make repair-apply` command should be extended for a limited development cycle,
for example `make cycle PROJECT=<name> MAX_REPAIR_ITERATIONS=3`:

```text
project-verify
-> iterate
-> diagnose
-> if ERROR: repair-agent --min-severity error
-> targeted tests
-> repeat diagnose + iterate
-> make report
-> stop: zero ERROR, no progress, or iteration limit
```

Required properties:

- deterministic strategy takes precedence;
- no strategy yields `refused` with a reason, not a superficial repair;
- LLM proposal has Schema + GBNF, `baseHash`, evidence URI, and allowed paths;
- LLM patch goes to an isolated candidate first;
- each attempt has a before/after receipt and a list of actually run tests;
- an identical error without progress cannot cause an infinite loop;
- `WARNING` is not automatically repaired if it requires new data or a design decision.

Integration tests should inject at least: a repairable configuration error, an unrepairable
error, an invalid patchDSL, a change in the base hash during operation, and a regression detected after apply.

## Stage 5 — vertical integration without duplicates

Target cross-project flow:

```text
doDSL intake
  -> f2md/research-agent SourceCoverage + Markdown + ResourceDSL
  -> todo2code Intent Evidence + diagnostics
  -> doDSL candidate bundle
  -> onlyDSL SSOT candidate validation/promotion
  -> immutable accepted bundle URI
  -> twin-dsl Tree/Math/Twin/Scene
  -> diagnose-agent report
  -> onlyDSL RepairPlanDSL
  -> repair-agent controlled execution
```

The first benchmark should include one small fixture and a real
`nanobionic-laboratory-md`. At the boundaries, test files, not private library functions.

Acceptance criteria:

- one canonical implementation of each schema and compiler;
- contract compliance checked by a version matrix in CI;
- no import of `doDSL` from `onlyDSL` in the opposite direction;
- `twin-dsl` also works without integration services running on saved artifacts;
- removing OpenRouter does not change deterministic findings;
- no project names a candidate an accepted state.

## Developer Makefile interface

Already available and recommended:

```bash
make up
make doctor
make project-verify PROJECT=nanobionic-laboratory-md
make iterate PROJECT=nanobionic-laboratory-md MODE=deterministic
make diagnose PROJECT=nanobionic-laboratory-md
make repair-plan PROJECT=nanobionic-laboratory-md
make report PROJECT=nanobionic-laboratory-md
make dashboard PROJECT=nanobionic-laboratory-md PORT=7444
```

`make dashboard` recognizes its own running dashboard and can reuse it; a foreign process
on the port should terminate with a clear error. Do not automatically kill a process just because
it occupies the default port.

To add:

```bash
make coverage PROJECT=<name>             # SourceCoverageDSL + compact counters
make capture PROJECT=<name> PORT=<port>  # capture + camera manifest + validation
make cycle PROJECT=<name>                # bounded development loop
make report-json PROJECT=<name>          # stable machine report next to status.md
make deps-lock PROJECT=<name>            # exact commits and contract hashes
```

Each target should return a non-zero code for an error, print `SKIPPED` with a reason, and leave a receipt.

## Order in `TODO.md`

The current `TODO.md` is generated by Prefact and contains 202 active entries. Many of them repeat
the same remarks for copied demo vendors or treat normal CLI and Python package constructs
as a problem. This is not a 202-item list of runtime defects.

Proposed organization:

1. exclude `vendor/`, `dist/`, and generated demo directories from upstream source analysis;
2. deduplicate by stable key rule + canonical path + symbol;
3. configure explicit exceptions for valid relative imports and `print` in CLI;
4. save the full Prefact result as a report, and promote only accepted tasks to `TODO.md`;
5. separate code quality backlog from ProjectIntegrity findings and data deficiencies;
6. recalculate the list after configuration changes, instead of manually editing the generated block.

## Gateway of each iteration

Minimum definition of completion:

1. schema and renderer DSL have positive, negative, and schema drift tests;
2. each LLM context passes Schema + GBNF + hash-bound patchDSL audit;
3. unit and integration tests are green without implicit omissions;
4. `make project-verify` and `make report` pass;
5. real project iteration has `validation.ok=true`;
6. immediate repetition yields `noChange=true`;
7. the dashboard passes a read-only smoke test;
8. active assets pass HTTP/GLB/hash verification;
9. project vendor is synchronized with the released version;
10. publication occurs via `goal -a`, after which the tag and `origin/main` are checked;
11. existing user changes remain outside the commit and retain their hashes.

## When to stop automatic evolution

The cycle should stop when:

- there is no `ERROR`;
- other warnings require new measurements, CAD, camera, or owner decision;
- the next strategy does not change diagnostics;
- the base patch hash has changed;
- post-fix test introduced a regression;
- iteration or time limit reached.

Stopping with a warning and a precise reason is a correct outcome. Generating missing
data or signing an old dump as new evidence is not a fix.
