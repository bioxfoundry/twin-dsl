# Changelog

## [Unreleased] - 2026-08-06

### Fixed
- Fix ast-sorted-imports issues (ticket-3d7680cd)
- Fix ast-missing-return-type issues (ticket-2f8c4185)
- Fix ruff-sorted-imports issues (ticket-a28c2f25)
- Fix smart-return-type issues (ticket-8e3ef0e3)
- Fix import-optimization issues (ticket-ab3402c0)

## 0.2.0 — 2026-08-06

- added OpenRouter-backed `NL → intent/resource/query/dql/tree/math/twin/scene DSL`;
- retained `todo2code` as the canonical Intent Evidence DSL runtime;
- added strict structured-output schemas and `deterministic|prefer-llm|require-llm` modes;
- added DQL sitemap crawler with budgets, host/path allowlists and network guards;
- added folder, ZIP, Docling and ClickHouse adapters;
- added real-time Biofoundry Digital Twin pipeline and OpenUSD scene materialization;
- added no-change detection, source precedence and blocked-candidate preservation;
- added researcher and Biofoundry examples plus 8 passing tests.

## 0.1.0 — 2026-08-06

- initial query/tree/math Digital Twin starter.
