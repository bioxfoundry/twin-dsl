# Changelog

## 0.3.0 — 2026-08-06

### Added

- canonical living loop: research → development evidence → observationDSL → mathDSL → twinDSL → sceneDSL → feedback;
- `projectDSL` (`subactor.living-project/v1`);
- `observationDSL` (`subactor.observation/v1`);
- `subactor.living-iteration/v1` receipts and append-only events;
- generic LivingProjectRuntime and watcher;
- project wizard generating isolated Docker Compose stacks, ports, data directories, vendored runtime and CI/CD;
- quick `project-add-source` for arbitrary files, directories, ZIPs, code and runtime logs;
- todo2code process adapter contract test;
- no-change identity including projectDSL, knowledge, development graph and observations;
- project-level candidate/current scene publication and fail-closed self-modification policy;
- GitHub Actions CI and GHCR release workflows.

### Verified

- 10 Protobuf files;
- 11/11 Node tests;
- NL → 10 DSL contracts;
- root and generated Docker Compose YAML;
- root and generated GitHub Actions YAML;
- full offline living loop and real-time update;
- manager-policy change blocks publication and preserves the current scene.

### Known boundaries

- Docker daemon was unavailable in the build environment, so images were not started locally;
- live OpenRouter and the complete real todo2code checkout were not executed; controlled structured-output and process-adapter tests passed;
- autonomous runtime source mutation remains disabled by default.

## 0.2.0 — 2026-08-06

- OpenRouter NL → DSL compiler;
- DQL sitemap crawler;
- folder/ZIP researcher;
- real-time Biofoundry conceptual Twin and OpenUSD scene.
