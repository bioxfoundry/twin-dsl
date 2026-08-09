# Changelog

## [0.5.21] - 2026-08-09

### Fixed
- Address intentDSL source and record revisions by raw Markdown bytes, including CRLF files.
- Validate complete language-policy coverage, source hashes, record provenance and exact source sets
  before refreshing a generated DSL conversion contract.
- Keep specialized SCAD packs under the same raw-byte Markdown source-hash convention.

## [Unreleased] - 2026-08-08

### Added
- Add executable AssemblyDSL and assembly-report DSL/JSON artifacts with device/part identity,
  grounded asset, placement and completeness gates.
- Add dashboard assembly metrics and persistent `dashboard-<port>.log` JSONL diagnostics.
- Extract `@subactor/assembly-dsl` and `@subactor/live-twin-state` as independently built,
  zero-runtime-dependency packages with contract tests and backwards-compatible application exports.
- Add a package-boundary gate for export identity, structural contract compatibility, and canonical
  observation URI parity, plus `packages:check|test|build` commands.

### Fixed
- Bound the default OpenRouter wait to 30 seconds with one repair retry, preventing a
  `prefer-llm` dashboard iteration from expanding into repeated two-minute waits per artifact.
- Update the autonomy demo to prove protected authority-field rejection and then merge only an
  allowed semantic proposal, matching the fail-closed runtime policy.
- Feed local DSL parser failures back into OpenRouter structured-output retries and unwrap fenced
  DSL for weaker models; `llm` CLI alias now maps to fail-safe `prefer-llm`.
- Recover an iteration lease immediately when its recorded writer PID no longer exists.
- Bound and compact the resource index supplied to LLM projections.
- Route already converted names such as `report.pdf.md` and `deck.pptx.lt.md` as Markdown instead
  of invoking PDF/Office converters again; content-addressed suffixes now use the rightmost known
  format and TestQL/Assembly DSL remains raw canonical text.
- Make dashboard video capture negotiate WebM codecs, use a 30 FPS stream with timeslices and
  report `EMPTY_VIDEO_BLOB` instead of silently downloading an unusable recording.
- Preserve the detailed application/log/Assembly/presentation index in generated `START.md` when
  an idempotent iteration exits through `noChange`.
- Re-ground the BIO-SPEC GL45 part to its current immutable GLB resource URI in Physical Evidence
  and AssemblyDSL.
- Fix ast-string-concat issues (ticket-92a0cecc)

## [0.5.22] - 2026-08-09

### Test
- Update test/project-wizard.test.ts

### Other
- Update src/core/generation.ts
- Update src/runtime/living-project.ts

## [0.5.20] - 2026-08-09

### Docs
- Update README.md
- Update docs/DASHBOARD.md

### Test
- Update test/dashboard.test.ts

### Other
- Update Makefile
- Update scripts/dashboard-port-check.mjs
- Update src/cli/main.ts
- Update src/serve/dashboard.ts

## [0.5.19] - 2026-08-09

### Other
- Update js/f2md/package.json
- Update js/f2md/src/index.ts
- Update py/f2md/pyproject.toml

## [0.5.18] - 2026-08-09

### Test
- Update test/scanner-testql.test.ts

### Other
- Update deploy/docling/server.py
- Update js/f2md/src/converters.ts
- Update js/f2md/src/detect.ts
- Update js/f2md/src/index.ts
- Update js/f2md/test/f2md.test.ts
- Update py/f2md/src/f2md/__init__.py
- Update py/f2md/src/f2md/converters.py
- Update py/f2md/src/f2md/detect.py
- Update py/f2md/tests/test_f2md.py
- Update src/adapters/document-converter.ts
- ... and 1 more files

## [0.5.17] - 2026-08-09

### Other
- Update VERSION
- Update package-lock.json
- Update py/f2md/src/f2md/__init__.py

## [0.5.15] - 2026-08-09

### Test
- Update test/project-wizard.test.ts

### Other
- Update VERSION
- Update deploy/runtime/Dockerfile
- Update package-lock.json
- Update py/f2md/src/f2md/__init__.py
- Update scripts/sync-vendored-runtime.mjs
- Update src/project/wizard.ts
- Update src/runtime/living-project.ts

## [0.5.13] - 2026-08-09

### Docs
- Update py/f2md/README.md

### Test
- Update test/project-wizard.test.ts

### Other
- Update py/f2md/src/f2md/intent_compile.py
- Update py/f2md/src/f2md/tree.py
- Update py/f2md/tests/test_f2md.py
- Update scripts/sync-vendored-runtime.mjs
- Update src/project/wizard.ts

## [0.5.12] - 2026-08-09

### Docs
- Update docs/PROJECT_WIZARD.md

### Test
- Update test/project-wizard.test.ts

### Other
- Update scripts/sync-vendored-runtime.mjs
- Update src/project/wizard.ts

## [0.5.11] - 2026-08-09

### Docs
- Update docs/PROJECT_WIZARD.md

### Test
- Update test/project-wizard.test.ts

### Other
- Update scripts/sync-vendored-runtime.mjs
- Update src/project/wizard.ts

## [0.5.10] - 2026-08-09

### Docs
- Update docs/AUTONOMY_MODEL.md
- Update docs/FULL_AUTONOMY_GAPS.md
- Update docs/TODO2CODE_INTEGRATION.md

### Test
- Update test/mutation-grant.test.ts
- Update test/todo2code-adapter.test.ts

### Other
- Update schemas/mutation-proposal-receipt.schema.json
- Update src/adapters/todo2code.ts
- Update src/core/types/project-runtime.ts
- Update src/runtime/mutation-pipeline.ts

## [0.5.9] - 2026-08-09

### Test
- Update test/project-wizard.test.ts
- Update test/scanner-testql.test.ts

### Other
- Update src/ingestion/scanner.ts

## [0.5.8] - 2026-08-09

### Docs
- Update README.md
- Update docs/OPENROUTER_NL_TO_DSL.md

### Test
- Update test/geometry-build.test.ts
- Update test/openrouter.test.ts
- Update test/patch-dsl.test.ts
- Update test/todo2code-adapter.test.ts

### Other
- Update py/f2md/src/f2md/intent_compile.py
- Update py/f2md/src/f2md/llm_patch.py
- Update py/f2md/src/f2md/translate.py
- Update py/f2md/tests/test_f2md.py
- Update scripts/scad-to-markdown.py
- Update src/adapters/todo2code.ts
- Update src/llm/dsl-schemas.ts
- Update src/llm/nl-dsl-compiler.ts
- Update src/llm/openrouter.ts
- Update src/llm/patch-dsl.ts

## [0.5.7] - 2026-08-09

### Docs
- Update README.md
- Update docs/AUTONOMY_EXAMPLES.md
- Update docs/EVENT_HISTORY_AUTONOMY.md
- Update docs/QUICK_SOURCE_RECIPES.md
- Update docs/source/AUTONOMY_CONTRACTS(1).md
- Update project/TICKETS.md
- Update project/ticket-01-autonomy-policy-without-grant.md
- Update project/ticket-02-runtime-generation-not-landed.md
- Update project/ticket-03-development-loop-is-a-fixture.md
- Update project/ticket-04-feedback-has-no-actuation.md
- ... and 6 more files

### Test
- Update test/mutation-grant.test.ts
- Update test/project-wizard.test.ts

### Other
- Update .env.example
- Update src/adapters/twin-probes.ts
- Update src/cli/main.ts
- Update src/project/wizard.ts

## [0.5.6] - 2026-08-09

### Docs
- Update README.md
- Update TODO.md
- Update docs/PACKAGE_ARCHITECTURE.md
- Update project/README.md
- Update project/context.md

### Test
- Update test/archive-project.test.ts
- Update test/biofoundry-concept.test.ts
- Update test/dashboard.test.ts
- Update test/geometry-build.test.ts

### Other
- Update .env.example
- Update app.doql.less
- Update img_4.png
- Update js/archive-project-analyzer/src/analyze.ts
- Update js/archive-project-analyzer/src/dsl.ts
- Update js/archive-project-analyzer/src/types.ts
- Update project/analysis.toon.yaml
- Update project/calls.mmd
- Update project/calls.png
- Update project/calls.toon.yaml
- ... and 19 more files

## [0.5.5] - 2026-08-08

### Docs
- Update CHANGELOG.md
- Update README.md
- Update TODO.md
- Update docs/DASHBOARD.md
- Update docs/DIGITAL_TWIN_DETAIL_AUDIT.md
- Update docs/DSL_SPEC.md
- Update docs/GEOMETRY_COMPILATION.md
- Update docs/NEXT_TEST_PLAN.md
- Update docs/OPENROUTER_NL_TO_DSL.md
- Update docs/PACKAGE_ARCHITECTURE.md
- ... and 6 more files

### Test
- Update test/assembly.test.ts
- Update test/autonomy.test.ts
- Update test/dashboard.test.ts
- Update test/geometry-build.test.ts
- Update test/openrouter.test.ts
- Update test/package-boundaries.test.ts
- Update test/project-integrity.test.ts
- Update test/project-observation-dsl.test.ts
- Update test/schema-drift.test.ts
- Update test/todo2code-adapter.test.ts
- ... and 1 more files

### Other
- Update .env.example
- Update .gitignore
- Update app.doql.less
- Update deploy/runtime/Dockerfile
- Update js/archive-project-analyzer/package.json
- Update js/archive-project-analyzer/src/analyze.ts
- Update js/archive-project-analyzer/src/dsl.ts
- Update js/archive-project-analyzer/src/index.ts
- Update js/archive-project-analyzer/src/types.ts
- Update js/archive-project-analyzer/test/analyze.test.ts
- ... and 77 more files

## [Unreleased] - 2026-08-08

### Fixed
- Fix relative-imports issues (ticket-a48c2c53)
- Fix ast-unused-imports issues (ticket-7ad3638b)
- Fix ast-sorted-imports issues (ticket-8f40596d)
- Fix ast-print-statements issues (ticket-33788d98)
- Fix ruff-unused-imports issues (ticket-245eef41)
- Fix ruff-print-statements issues (ticket-3cb1efa8)
- Fix string-concat-fstring issues (ticket-d4f405d2)
- Fix unused-imports issues (ticket-6e9cd21a)
- Fix magic-numbers issues (ticket-0073088c)
- Fix ai-boilerplate issues (ticket-3ac36432)
- Fix string-formatting issues (ticket-ea8c07cd)
- Fix import-optimization issues (ticket-c88c489e)
- Fix no-relative-imports issues (ticket-a02c1cc0)
- Fix ruff-sorted-imports issues (ticket-6d9d9897)
- Fix ast-unused-imports issues (ticket-9da57972)
- Fix ast-sorted-imports issues (ticket-7c7e5e99)
- Fix ast-string-concat issues (ticket-89134145)
- Fix ast-print-statements issues (ticket-e1c11878)
- Fix ruff-unused-imports issues (ticket-79ad8fc3)
- Fix ruff-print-statements issues (ticket-5e8089a8)
- Fix string-concat-fstring issues (ticket-1fa5af68)
- Fix unused-imports issues (ticket-b424ca7a)
- Fix magic-numbers issues (ticket-5730b671)
- Fix ai-boilerplate issues (ticket-be18ca01)
- Fix import-optimization issues (ticket-cd139164)
- Fix ast-string-concat issues (ticket-ef82e2d0)
- Fix ast-print-statements issues (ticket-7eac3111)
- Fix ast-missing-return-type issues (ticket-6383a634)
- Fix ruff-print-statements issues (ticket-24b0eac4)
- Fix ruff-sorted-imports issues (ticket-3fcf9308)

## [0.5.4] - 2026-08-08

### Docs
- Update docs/DASHBOARD.md
- Update docs/PHYSICAL_EVIDENCE_INTAKE.md
- Update docs/SEMANTIC_SCENE_BLUEPRINT.md

### Test
- Update test/autonomy.test.ts
- Update test/dashboard.test.ts
- Update test/geometry-build.test.ts
- Update test/geometry-validation.test.ts
- Update test/openusd-render.test.ts
- Update test/scene-blueprint.test.ts
- Update test/schema-drift.test.ts

### Other
- Update .env.example
- Update public/dashboard.html
- Update schemas/geometry-build-receipt.schema.json
- Update schemas/geometry-build.schema.json
- Update schemas/project.schema.json
- Update schemas/scene-blueprint.schema.json
- Update scripts/cad-to-gltf.py
- Update src/adapters/openscad.ts
- Update src/cli/main.ts
- Update src/core/generation.ts
- ... and 18 more files

## [0.5.3] - 2026-08-08

### Docs
- Update CHANGELOG.md
- Update TODO.md
- Update docs/DASHBOARD.md
- Update docs/DSL_SPEC.md
- Update docs/PROJECT_INTEGRITY_DSL.md
- Update project/README.md
- Update project/context.md

### Test
- Update test/dashboard.test.ts
- Update test/project-integrity.test.ts

### Other
- Update .env.example
- Update app.doql.less
- Update planfile.yaml
- Update project/analysis.toon.yaml
- Update project/calls.mmd
- Update project/calls.png
- Update project/calls.toon.yaml
- Update project/calls.yaml
- Update project/compact_flow.mmd
- Update project/compact_flow.png
- ... and 16 more files

## [Unreleased] - 2026-08-08

### Fixed
- Fix ast-sorted-imports issues (ticket-a66ce302)
- Fix ast-missing-return-type issues (ticket-db4bd1e8)
- Fix ruff-sorted-imports issues (ticket-6efe5406)
- Fix smart-return-type issues (ticket-6e41a4fe)
- Fix import-optimization issues (ticket-beb6ea71)
- Fix ast-sorted-imports issues (ticket-14a0d2b1)
- Fix ast-missing-return-type issues (ticket-1768316a)
- Fix ruff-sorted-imports issues (ticket-d8f9b94c)
- Fix smart-return-type issues (ticket-51ee4182)
- Fix import-optimization issues (ticket-4149d3ed)
- Fix ast-sorted-imports issues (ticket-6086ee9d)
- Fix ast-missing-return-type issues (ticket-a44ba391)
- Fix ruff-sorted-imports issues (ticket-cadce839)
- Fix smart-return-type issues (ticket-e07494f4)
- Fix import-optimization issues (ticket-8b13a479)
- Fix relative-imports issues (ticket-939493a6)
- Fix ast-unused-imports issues (ticket-d890c16f)
- Fix ast-sorted-imports issues (ticket-3c9f1f73)
- Fix ruff-sorted-imports issues (ticket-1ed89356)
- Fix import-optimization issues (ticket-64abd0d6)
- Fix no-relative-imports issues (ticket-0f048ade)
- Fix relative-imports issues (ticket-3062e250)
- Fix ast-unused-imports issues (ticket-2111b556)
- Fix ast-sorted-imports issues (ticket-0b24e836)
- Fix no-relative-imports issues (ticket-9f47dfd1)
- Fix relative-imports issues (ticket-8446bf5a)
- Fix ast-unused-imports issues (ticket-feecd95a)
- Fix ast-sorted-imports issues (ticket-9d9ce8d8)
- Fix ast-print-statements issues (ticket-5d088ffe)
- Fix ruff-print-statements issues (ticket-d8810eac)
- Fix ai-boilerplate issues (ticket-35b197b0)
- Fix import-optimization issues (ticket-d38231f7)
- Fix no-relative-imports issues (ticket-843fb4a9)
- Fix ast-unused-imports issues (ticket-f0aca0fa)
- Fix import-optimization issues (ticket-aea81bf5)
- Fix relative-imports issues (ticket-f542174a)
- Fix ast-unused-imports issues (ticket-bad016a3)
- Fix ast-sorted-imports issues (ticket-1d0dbe39)
- Fix string-concat-fstring issues (ticket-7b87d701)
- Fix magic-numbers issues (ticket-491fde45)
- Fix import-optimization issues (ticket-67c59b94)
- Fix no-relative-imports issues (ticket-7d23f762)
- Fix relative-imports issues (ticket-5d920f61)
- Fix ast-unused-imports issues (ticket-64978555)
- Fix ast-sorted-imports issues (ticket-d429c339)
- Fix ast-string-concat issues (ticket-26238385)
- Fix string-concat-fstring issues (ticket-d418a18d)
- Fix magic-numbers issues (ticket-d0095c81)
- Fix import-optimization issues (ticket-d0010dc2)
- Fix no-relative-imports issues (ticket-c9f68d0e)
- Fix relative-imports issues (ticket-f2541169)
- Fix ast-unused-imports issues (ticket-9585a50a)
- Fix ast-sorted-imports issues (ticket-92a61418)
- Fix ast-string-concat issues (ticket-c8f5a4f0)
- Fix string-concat-fstring issues (ticket-2e735b76)
- Fix magic-numbers issues (ticket-bee5c514)
- Fix import-optimization issues (ticket-100f330b)
- Fix no-relative-imports issues (ticket-050eccbb)
- Fix ast-unused-imports issues (ticket-ca2d94e9)
- Fix import-optimization issues (ticket-febb2b06)

## [0.5.2] - 2026-08-08

### Docs
- Update CHANGELOG.md
- Update README.md
- Update TODO.md
- Update docs/AUDIT_AND_INTENT_VALIDATION.md
- Update docs/DASHBOARD.md
- Update docs/DSL_SPEC.md
- Update docs/NEXT_TEST_PLAN.md
- Update docs/PHYSICAL_EVIDENCE_INTAKE.md
- Update docs/SEMANTIC_SCENE_BLUEPRINT.md
- Update js/f2md/README.md
- ... and 3 more files

### Test
- Update test/dashboard.test.ts
- Update test/geometry-validation.test.ts
- Update test/openusd-render.test.ts
- Update test/physical-evidence.test.ts
- Update test/scanner-testql.test.ts

### Other
- Update .env.example
- Update app.doql.less
- Update img_3.png
- Update js/f2md/src/chain.ts
- Update js/f2md/src/converters.ts
- Update js/f2md/src/index.ts
- Update planfile.yaml
- Update project/analysis.toon.yaml
- Update project/calls.mmd
- Update project/calls.png
- ... and 40 more files

## [Unreleased]

Covers everything after 0.5.1. Newest entries first.

## 2026-08-08 — defect fixes (unreleased)

### Fixed

- **Intake no longer destroys established evidence.** `POST /api/intake` replaced
  `baseline/physical-evidence.json` wholesale before the runtime validated it, so the
  `placeholder < document < measured < cad < ifc < verified` rule held only *within* one
  document. A rejected — or merely smaller — intake discarded every previously applied record
  and reverted those components to `placeholder`, while still answering 200. Reproduced against
  the live service: six hardened components lost at once.
  The handler now judges the posted document on its own against the live twin, writes **only
  accepted records**, merged by `componentId` onto what the project already holds, and answers
  **422** without writing when nothing was accepted. The pre-check receives `allowedAssetUris`
  from `current/resources.json`, so `ASSET_NOT_GROUNDED` is caught before any write rather than
  only inside the runtime. Partial application is unchanged: valid records still apply while
  invalid ones are reported.
- **`cadAssetCount` sees f2md corpora.** The extension test was anchored on the true end of the
  name, which never matches a mirror where every file ends in `.md`; CAD parts were counted only
  when the path happened to contain the substring `cad`. `bioprinter_mos3s_01` reported none
  despite 14 `*.stl.md` parts. It now reports 14, `microfluidic_assembly_01` 14 and
  `biospec_bioreactor_01` 19. Prose such as `installation-steps.md` is still not geometry.
- **A hardened component stops advertising its placeholder.** `applyPhysicalEvidence` updated
  geometry but not `label`, so the dashboard showed an `ifc` badge beside "Facility envelope
  (placeholder 60×36 m)" and a real 58.2 × 34.6 m. The placeholder clause is now dropped when
  evidence supersedes it; the component name survives, and identity (`componentId`, `scenePath`)
  is untouched.
- **A runtime fix now reaches existing projects.** Iterations were skipped whenever the four
  input hashes matched, and the runtime was not part of that key — so a change to how the twin
  is *derived* from unchanged inputs never propagated: the fix shipped, every hash stayed
  identical, and every existing twin kept the old values. `RUNTIME_GENERATION`
  (`src/core/generation.ts`) now participates in the short-circuit; `DT_FORCE_ITERATION=1`
  forces a re-derivation without bumping it. Found while verifying the `cadAssetCount` fix,
  which silently did not apply.
- **`/api/intake` race**: `busy` is claimed before the first `await`, so two concurrent posts no
  longer both pass the guard.
- **`alert()` removed** from the dashboard in favour of an inline status line; a modal froze the
  event loop, stalling the 5 s refresh and any automation driving the page.
- **`engines.node`** relaxed from `>=22` to `>=20.19`, matching the version `verify` demonstrably
  passes on.

### Tests

58 Node tests (was 55). New regressions pin: evidence accumulating across intakes with a fully
rejected document changing nothing; CAD detection across a binary corpus and its Markdown
mirror; and placeholder-claim removal leaving honest labels alone.

## 2026-08-08 — documentation and verification (unreleased)

### Documentation

- README brought in line with the code it describes: version 0.5.1 (was 0.5.0), 55/55 Node tests
  (was 17/17), the `dashboard` command's fourth `mode` argument, Node 22 in `engines`, and a docs
  index covering the 12 files under `docs/` that nothing linked to.
- Corpus figures re-measured against `nanobionic-laboratory-md` rather than an older snapshot:
  146 generated files, 53 with `ocr: true` (was "52 of 101"), 33 no-text-layer stubs (was "33 of 134").
- f2md package parity spelled out: `--secret-pattern`, `--translate` and `--translation-policy` are
  Python-only, so a corpus with a confidentiality policy cannot be built with the npm package.
- New worked example: feeding a living project from an f2md Markdown corpus, with the grounding
  result of a real run (30/30 components grounded, none falling back to role-only evidence).
- **Known limitations** section in the README, and matching warnings in `docs/DASHBOARD.md` and
  `docs/SEMANTIC_SCENE_BLUEPRINT.md`, covering the three defects found while verifying that run
  (see below). None of them are fixed yet — they are documented so they are not rediscovered.

### Known issues recorded (not yet fixed)

- `POST /api/intake` overwrites `baseline/physical-evidence.json` before the runtime validates it.
  The evidence file is replaced rather than merged, so a rejected or smaller document discards every
  previously applied record and reverts those components to `placeholder` — while still answering
  `200`. `docs/DASHBOARD.md` claimed such a document is "refused before anything is written"; that
  holds only for the checks the dashboard's own pre-check performs, not for `ASSET_NOT_GROUNDED`.
- `cadAssetCount` in `src/scene/blueprint.ts` tests extensions with an end-anchored regex, which
  never matches an f2md corpus (`*.stl.md`). CAD assets are counted only when the path happens to
  contain the substring `cad`.
- `applyPhysicalEvidence` updates geometry but not `label`, so a hardened component still advertises
  its placeholder dimensions next to an `ifc` badge.

### Fixed

- `CHANGELOG.md` had two `[Unreleased]` headings; the 2026-08-06 one sat above the released 0.5.1
  and so belonged to no version. It is now `0.5.1a`.

## 2026-08-07 — dashboard, physical intake, f2md split (unreleased)

### Added

- **Live factory dashboard** (`dashboard` CLI command, `docs/DASHBOARD.md`): serves a living
  project's twin/scene over HTTP and renders the factory in 3D. Dependency-free — `node:http` plus a
  hand-written WebGL renderer, no CDN and no build step. Colour encodes geometry evidence, so the
  factory visibly hardens as floor-plan and register data arrives; identity invariants and the
  evidence report are shown next to the scene. `POST /api/intake` is durable rather than a preview:
  it writes the evidence file, wires `SCENE_PHYSICAL_EVIDENCE_FILE` and runs an iteration, so the
  result is a real new twin revision. Local-only by design: no auth, binds to `127.0.0.1`.

- **Physical Evidence Intake** (`subactor.physical-evidence/v1`): replaces placeholder geometry with
  floor-plan / CAD / IFC / survey / register facts while `componentId` and `scenePath` stay stable.
  Evidence grades are ranked `placeholder < document < measured < cad < ifc < verified`; a weaker
  grade never overwrites stronger geometry, unknown component ids are rejected instead of created,
  and a mesh reference outside the ingested corpus is refused (`ASSET_NOT_GROUNDED`).
- `SCENE_PHYSICAL_EVIDENCE_FILE` in projectDSL; the evidence document is part of the project config
  hash, so new physical facts force a new twin revision on their own.
- `physical-evidence.report.json` iteration artifact with machine-checkable `componentIdsStable` /
  `scenePathsStable` invariants; rejections surface as `PHYSICAL_EVIDENCE_REJECTED:*` warnings.
- CLI `physical-intake` (apply evidence to a twin/scene pair) and `scene-render` (export any pair to
  OpenUSD — the renderer previously had no CLI entry point at all).
- `npm run demo:physical`: end-to-end intake demo through the real runtime, wired into `npm run verify`.
  It is also the first demo to exercise the scene-blueprint path, which until now was unit-tested only.
- `schemas/physical-evidence.schema.json` and a fillable `physical-intake/templates/` contract;
  `docs/PHYSICAL_EVIDENCE_INTAKE.md`.
- **Schema drift guard**: `src/core/json-schema.ts` is a dependency-free evaluator for exactly the
  vocabulary `schemas/*.json` uses, and `test/schema-drift.test.ts` asserts that a document accepted
  by a published schema is accepted by its hand-written runtime validator and vice versa, over a
  corpus of 45 documents. A schema growing an unsupported keyword fails the suite rather than
  quietly weakening it. The shipped biofoundry blueprint and intake template are checked against
  both descriptions.

- **f2md 0.2.0 — operational provenance.** The envelope now also carries `backendType`
  (`stdlib`/`binary`/`python`/`node`/`http`), `inputKind`, `ocr`, `fallbackDepth`, `durationMs` and
  `warnings`. That is what separates an orchestration layer from a wrapper: a high `fallbackDepth`
  means a badly ordered chain, `warnings` records truncation and lost tables instead of losing them
  silently, and `ocr` distinguishes a clean text extraction from a recognition guess. Both packages
  emit the same camelCase keys.
- **f2md backends.** Python gains `PyMuPDFConverter` (`pymupdf4llm`, structured PDF Markdown that
  declines scans so they reach an OCR backend) and `MarkItDownConverter`, both optional extras.
  JavaScript gains `TurndownConverter` (HTML) and `MammothConverter` (DOCX → semantic HTML →
  Turndown, since Mammoth's own Markdown output is deprecated upstream), both optional peer
  dependencies so the core stays dependency-free. Markup backends sit **before** the text backend
  in the chain, otherwise HTML would be fenced as a code block rather than converted.
- **`f2md --tree SRC OUT`** mirrors a directory into Markdown: `src/a/b.pdf` → `out/a/b.pdf.md`,
  with the full envelope as YAML front matter. Files with no text layer still get a stub file, so
  the mirrored tree never silently disagrees with its source.
- **Cross-language conformance** (`npm run f2md:conformance`, wired into `verify`): shared fixtures
  are converted by both implementations and the envelope contract is compared. Routing differences
  are reported rather than failed — they depend on which optional backends are installed, which is
  a deployment fact, not a contract violation.
- **Document conversion extracted as a standalone package**, in `py/f2md` (PyPI `f2md`) and
  `js/f2md` (npm `@subactor/f2md`), both producing the same envelope so either side of a pipeline
  agrees on provenance. The runtime now consumes `js/f2md` rather than carrying its own copy, so
  there is one implementation. Python core is stdlib-only; the JS package has no dependencies.
  Both ship a `f2md` CLI. npm `f2md` was already taken by an unrelated package, hence the scope.
- `make up` / `make down` / `make restart`, plus `build`, `logs`, `ps`, `service-check`,
  `down-clean` and `prune-cache`. `up`/`build`/`restart` create `.env` from `.env.example` on first
  use, so the documented defaults are the ones that actually apply; an existing `.env` is never
  overwritten.

### Fixed

- **The Docling service had never converted anything.** `import cv2` failed with
  `libxcb.so.1: cannot open shared object file` because docling pulls `opencv-python` (the GUI
  build) into a slim image with no X11 libraries, and then torch's inductor backend failed with
  `InvalidCxxCompiler` because the image has no C++ toolchain. Only `/health` worked — which is
  exactly what the compose healthcheck probes, so the stack reported healthy while every
  conversion returned HTTP 500. Now swaps in `opencv-python-headless` (in order — both
  distributions own the same `cv2` directory) and runs torch in eager mode.
- **Docker builds re-downloaded gigabytes every time.** `--no-cache-dir` actively defeated pip's
  cache, and docling resolved torch to CUDA builds pulling ~3 GB of `nvidia_*` wheels this CPU
  service never uses. With BuildKit cache mounts and the CPU-only torch index, the image dropped
  from 5.83 GB to 1.79 GB and a repeat build went from ~885 s to 5 s. Model weights now live on a
  named volume, so `down` no longer discards them.
- **The compose stack could not use its own ClickHouse.** The official image logs
  "disabling network access for user 'default'" and restricts it to `127.0.0.1` unless
  `CLICKHOUSE_USER` or `CLICKHOUSE_PASSWORD` is set, so every cross-container query returned
  HTTP 401 — including `runtime` → `clickhouse:8123` with `DT_SEARCH_BACKEND=clickhouse`.
  Credentials are now set on both services, and `ClickHouseHttpProjection` sends them as
  `X-ClickHouse-User` / `X-ClickHouse-Key` headers (it had no authentication support at all)
  so they never reach a query string or log.
- **ClickHouse inserts never worked.** `created_at` was sent as ISO-8601, which JSONEachRow
  rejects for `DateTime64(3)` with `CANNOT_PARSE_INPUT_ASSERTION_FAILED`; the 401 above had been
  masking it. Timestamps are now encoded as `YYYY-MM-DD HH:MM:SS.mmm` in UTC.
- `docker compose up` failed with "all predefined address pools have been fully subnetted" on
  hosts running many stacks. The project network is pinned to an explicit subnet
  (`DT_NETWORK_SUBNET`, default `10.201.7.0/24`) instead of drawing from the exhausted defaults.
  `check-compose` now enforces both the pinned subnet and the ClickHouse credentials.
- **OpenUSD cube geometry was rendered at half the declared extent.** `size = 1` was combined with
  `xformOp:scale = size/2`, so a 60×36 m envelope measured 30×18 m in the layer. Cylinders were
  correct, leaving scenes internally inconsistent. Verified against `pxr` (usd-core) bounding boxes.
- **Distinct scene paths sharing a leaf name produced duplicate USD prims**, which made the whole
  layer fail to open (`Duplicate prim`). The renderer flattened `scenePath` to its last segment, so
  `/Biofoundry/Zones/Build` and `/Biofoundry/Equipment/Build` collided.
- **`scenePath` hierarchy is now preserved**: USD prim paths mirror the binding paths, so
  `subactor:scenePath` — the stable identity anchor — matches the real path in the layer.
- `assetUri` on scene bindings is emitted (`custom asset subactor:assetUri`); it was silently dropped.
- `propertyMap` on scene bindings is honoured; it was populated in four places and read nowhere.
- Duplicate `subactor:label` attribute on every blueprint-generated prim; `sourceUris` is now a
  proper `string[]` instead of an unbounded comma-joined string.
- Blueprint components whose declared `sourceRoles` match no resource failed with an opaque
  `TWIN_COMPONENT_SOURCE_REQUIRED`; the error now names the component and the roles it needs.
- `validateSceneBlueprint` accepted empty `components`/`bindings`, unknown `sourceRole` values and
  malformed `position`/`size` vectors that the published JSON schema rejects — the latter rendered as
  an invalid `double3` and made the layer unloadable. It also accepted an unknown `primitive`, which
  fell through the renderer's switch and silently became a cube; plus unknown keys, duplicate
  `sourceRoles`, out-of-range `maxSourceUris` and malformed `propertyMap`/`label`/flags.

### Changed

- Demo and verification output (`.autonomy-demo/`, `.mutation-demo/`, and the other run directories)
  is no longer tracked in git — 112 generated files were committed, so every `npm run verify` dirtied
  the working tree. All of it is regenerated by `verify` and removed by `clean`.

## 0.5.1a — 2026-08-06 (lint sweep, folded into 0.5.1)

Previously headed `[Unreleased]`, which placed it above the already-released 0.5.1 and left it
belonging to no version at all.

### Fixed
- Fix ast-sorted-imports issues (ticket-6c18b3f3)
- Fix ast-missing-return-type issues (ticket-bd7400cb)
- Fix ruff-sorted-imports issues (ticket-5c4314df)
- Fix smart-return-type issues (ticket-0f970abe)
- Fix import-optimization issues (ticket-4893092b)

## 0.5.1 — 2026-08-06

### Added

- **Semantic Scene Blueprint** (`subactor.scene-blueprint/v1`): stable Twin/Scene component IDs (IDENTITY ≠ STATE); `SCENE_BLUEPRINT_FILE` in projectDSL; blueprint included in project config hash;
- Biofoundry Live **v0.2** default blueprint (17 components: facility + 8 layers + 8 equipment placeholders);
- Binary/non-text **resource stubs** in the scanner (PDF/CAD/ZIP paths keep provenance without Docling body text);
- ZIP listing without full binary extract (large OSCAR archives no longer block iteration);
- **Local PDF/DOCX extraction** via `pdftotext` + `pandoc` (`LocalToolDocumentConverter`) so offline scans get document body without Docling;
- Biofoundry **concept twin bridge** (`src/runtime/biofoundry-concept.ts`): profile `biofoundry` emits 8 semantic zones with stable `twin://biofoundry/...` IDs and placeholder geometry (ChatGPT concept v0.1 layout);
- readiness analysis: `ConceptScenePublishAllowed`, `PhysicalTwinReady`, `OperationalTwinReady`;
- treeDSL combines semantic layers + knowledge-source index;
- scene OpenUSD root `/Biofoundry` with 8-zone positions (60×36 m envelope, geometry explicitly placeholder);
- tests for concept twin/scene/readiness.

### Integration

- Connects living-runtime loop with `biofoundry-digital-twin-concept-v0.1` (GLB/USDA/DSL) so docs update the Biofoundry scene, not only abstract knowledge cubes.

## 0.5.0 — 2026-08-06

### Added

- Cryptographic `subactor.signed-mutation-grant/v1` issue/verify (HMAC-HS256 compact token), ported from `subactor/runtime` apply-grant;
- single-use jti store for apply-path grant consumption;
- isolated mutation workspaces (`git worktree` or directory copy);
- propose-only mutation pipeline with `subactor.mutation-proposal-receipt/v1`;
- gated isolated apply via todo2code `apply-source-patch` + approval hash;
- todo2code adapter methods `proposeSourcePatch` and `applySourcePatch`;
- twin-probes adapter for `subactor.autonom-cycle/v1` evidence summaries;
- CLI: `grant-issue`, `grant-verify`, `mutation-propose`, `mutation-apply`, `probes-ingest`;
- schemas for signed mutation grant and mutation proposal receipt;
- `npm run demo:mutation` offline demonstration;
- tests for grant crypto, isolation, propose pipeline and probe cycle validation.

### Security

- Placeholder / non-HMAC mutation grant signatures no longer satisfy `SignedMutationGrantPresent`;
- apply never writes the live development tree — only an isolated workspace.

## 0.4.0 — 2026-08-06

### Added

- `improvementDSL` (`subactor.improvement-plan/v1`) with propose-only actions;
- living iteration receipt v2 with trace, idempotency, development evidence and improvement URI;
- development evidence summary with manifest, diagnostics, blocking count and acceptance;
- deterministic authority-owned `mathDSL` gates;
- Twin/Scene grounding validation;
- persistent project lease for cross-process iteration exclusion;
- rate-limit enforcement before publication;
- failure receipts, dead-letter JSONL, failure events and bounded watcher retry;
- autonomy modes `observe|propose|apply` and signed-mutation-grant policy;
- Docker-safe imports for arbitrary external source paths with provenance manifest;
- `project-add-website`, `project-status` and `service-check` CLI commands;
- real ClickHouse SQL and Docling health service check;
- root Docker Integration workflow and stronger generated-project CI;
- autonomy examples and dedicated architecture/findings/CI documentation;
- Protobuf iteration v2 and autonomy contracts;
- duplicate Protobuf field-number validation.

### Fixed

- canonical todo2code now has priority over fixture input;
- fixture evidence no longer counts as accepted unless project policy permits it;
- LLM output cannot redefine runtime authority bindings or expressions;
- external sources no longer disappear inside generated Docker projects;
- identical timestamps do not trigger Scene regeneration;
- duplicate field number in iteration v1 Proto;
- Docker smoke now checks actual service connectivity instead of only printing configured URLs.

### Verified

- 12 Protobuf files;
- 17/17 Node tests;
- NL → 11 DSL contracts;
- all seven executable examples;
- root and generated Docker/CI YAML parsing;
- autonomy gates, leases, retry, dead-letter and last-known-good behavior.

### Known boundaries

- Docker daemon was unavailable locally; container integration is delegated to the delivered GitHub Actions workflow;
- live OpenRouter and a full current todo2code checkout were not executed in this container;
- cryptographic grant verification and autonomous source mutation remain intentionally incomplete.

## 0.3.0 — 2026-08-06

- canonical living loop: research → development evidence → observationDSL → mathDSL → twinDSL → sceneDSL → feedback;
- `projectDSL`, `observationDSL`, project wizard and per-project Docker/CI;
- generic living runtime, watcher and no-change handling.

## 0.2.0 — 2026-08-06

- OpenRouter NL → DSL compiler;
- DQL sitemap crawler;
- folder/ZIP researcher;
- real-time Biofoundry conceptual Twin and OpenUSD scene.
