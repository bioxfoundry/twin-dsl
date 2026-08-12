# Next test and iteration plan

> This document preserves a detailed baseline state from 2026-08-08. The current execution plan after
> release 0.5.34 is in [`NEXT_DEVELOPMENT_PLAN.md`](NEXT_DEVELOPMENT_PLAN.md).

## Baseline state — 2026-08-08

| Area | Result |
|---|---:|
| Python `f2md` | 40 passed, 2 skipped |
| JavaScript `@subactor/f2md` | 25 passed |
| Runtime Digital Twin | 95 passed |
| `onlyDSL` | 44 passed |
| `project-verify` | OK |
| corpus audit + Twin | 0 ERROR, 34 WARNING |
| Markdown → intentDSL | 112 files, 1311 records, 0 failures |
| canonical `t2c.intent/v1` validator | OK, 53 business-plan records |
| OpenRouter smoke test | OK, GLM-5.2 → 10 correct records |
| Twin components | 44 (30 scene bindings + 14 explicit MOS3S parts without guessed transforms) |
| active mesh bindings | 2 / 30 (2 unique assets; 3 erroneous bindings removed) |
| live-bound components | 2 / 44 (3 properties: 1 stale, 2 expired in last revision) |
| complete assembly | 0 / 2; 2 / 17 required parts complete; 16 assets grounded, 3 parts placed |
| SCAD `lid_UNF` compilation | PASS: 130,216 triangles, 3MF + GLB + USDA |
| SCAD ↔ STEP reference validation | PASS: derived source, 23.37 µm / 25 µm reference tolerance |
| runtime scanner warnings | 26: binary CAD only (23 GLB, 2 STL, 1 STEP); 0 erroneous `.pdf.md` attempts |
| feedback loop idempotence | PASS: `noChange=true`, diff 0/0/0 after propagation |

## P0 Priority — execute on every change

1. `pytest` in `py/f2md`.
2. `npm test` in `js/f2md`.
3. `npm test` in the runtime.
4. `python -m f2md.audit ... --twin ... --json`.
5. `python -m f2md.intent_compile ...` and validation of one full package by
   the runtime `validateT2cIntent`.
6. `project-verify` and deterministic `project-iterate`.
7. `geometry-build` for each active contract: dependency closure, 3MF/GLB/USD load,
   semantic mesh hash and independent reference check.

P0 acceptance: no errors, unchanged component IDs and scene paths, report
audit recorded with the revision.

## P1 Priority — next geometry iteration

1. Maintain explicit `ACTIVE/current` and separate `LATEST CANDIDATE`; a rejected scene cannot be
   rendered or exported, and its diagnostics cannot supersede ACTIVE validation.
2. Remove single-part asset-binding to workflow/device. GL45 can only bind a port,
   and `DisplayBox_2` only a part of a future bioprinter assembly.
3. ~~Reconcile `lid_UNF.scad` with reference STEP and do not loosen validation.~~ Achieved by
   a separate derived source `lid_UNF.step-aligned.scad`: 18 mm, 130,216 triangles, reference extent
   23.37 µm at 25 µm limit; original source remains unchanged as provenance.
4. For each `placeholder` component, select existing evidence from the body:
   `*.step.md`, `*.stl.md`, `*.f3d.md`, `*.scad.md`, IFC, survey, or floor plan.
5. Create `subactor.geometry-build/v1` for executable CAD or
   `subactor.physical-evidence/v1` for already verified meshes.
6. Create `subactor.physical-evidence/v1` with `assetUri` pointing to the asset after import,
   unit of meters and Z-axis.
7. Perform `physical-intake` and verify that the grade increases but never decreases.
8. Re-render OpenUSD and verify that the number of prims and sizes/positions correspond
   to scene bindings.

P1 Acceptance: `componentsWithoutGeometry` drops from 12 to 0 or every remaining placeholder has
   an explicit `NO_PHYSICAL_EVIDENCE` report with rationale.

## P1 priority — semantic live Twin

1. ~~Implement AssemblyDSL with persistent `device → assembly → part` hierarchy.~~ Achieved:
   `assembly-report.json/.dsl`, fail-closed identity/asset drift and separate `PASS · INCOMPLETE`.
   Next step: acquire authoritative transformations of 14 MOS3S parts and bioreactor plate mesh.
2. ~~Implement TwinState as a deterministic projection of ObservationDSL.~~ Achieved:
   `twin-state.json/.dsl`, source observation URN, and fail-closed component identity.
3. ~~Implement LiveBindingDSL with TTL and `ON_STALE`.~~ Achieved; dashboard shows separately
   `fresh|stale|expired|unknown`, and the old bootstrap temperature is not the current state.
4. Implement BehaviorDSL as a dashboard-independent state machine.
5. Add VisualDSL, which is the only one that can translate Behavior/TwinState into material or animation.
6. Only after a stable event model, add SSE; polling remains a fallback mechanism.

Acceptance: every visual change indicates `componentId`, observation URI, binding ID, before/after state
and BehaviorDSL rule; lack of explicit binding cannot change the scene.

## P1 Priority — conversion and translation quality

1. Remove 34 `CONFIDENTIALITY_MISMATCH` warnings by regenerating the entire tree
   with a single `--secret-pattern` or by marking exceptions in the manifest.
2. Add regression tests for LaTeX with table, math, list, and `tcolorbox` block.
3. Add Markdown behavior test for translation: headers, lists, tables, fenced code, and URI
   cannot be changed by Argos/OpenRouter.
4. Compare SHA-256 of source, `sourceRelative`, `translatedFrom`, and `translationOf` for both files.

P1 Acceptance: 0 confidentiality warnings, `*.<lang>.md`/`*.md` pairs complete, correct Markdown parser.

## P2 priority — intentDSL and LLM

1. Add snapshot tests: the same Markdown yields the same `sourceHash`, record IDs, and number of
   intents.
2. Add negative test: missing `schema`, duplicate ID, foreign `targetUri`, or changed source must
   result in `ERROR`, not publication.
3. ~~Test OpenRouter with a mocked endpoint, including local parser error fix.~~ Implemented:
   `MATH_HEADER_REQUIRED` error returns to the model, fenced DSL is normalized, 95/95 tests pass.
4. Continue real GLM/Grok tests in `prefer-llm` with a time budget. Latest GLM-5.2:
   with active todo2code MathDSL 36.4 s PASS (Baidu/OpenRouter), Twin and Scene exceeded
   budget → explicit deterministic fallback, `validation.ok=true`; previous call exactly
   from the dashboard took 141.6 s and also resulted in a successful publication.

P2 Acceptance: 100% of LLM responses pass validation or are rejected with a readable error;
no response modifies runtime files without a separate gate and consent.

## P2 priority — dashboard and recordings

1. Browser test checks for `Record 3D video`, `canvas.captureStream`, and WebM download.
2. Stability test: 30 seconds of recording does not change `componentId`, `scenePath`, or Twin revision.
3. Include WebM with `audit-report.json`, `generation-audit.json`, and revision URI in the presentation.

P2 Acceptance: recording is local, dashboard still works without recording, and evidentiary artifacts
have the same `iterationUri`.

## Stop criterion

Do not promote iterations to `apply` until: P0 without errors, `project-verify=OK`,
`validation.ok=true`, stable scene ID/paths, no unjustified placeholders, and complete
intent provenance. The current project remains correctly in `propose` mode.
