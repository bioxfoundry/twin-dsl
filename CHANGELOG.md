# Changelog

## [Unreleased] - 2026-08-07

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

### Fixed

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

## [Unreleased] - 2026-08-06

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
