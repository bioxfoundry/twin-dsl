# Changelog

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
