# Test plan

## Automated gates in 0.2.0

- TypeScript strict;
- 8 Node tests;
- query/tree/math parsers;
- hard-gate comparisons;
- DQL sitemap, host/path/context budgets;
- OpenRouter structured-output mock;
- `NL → intent/resource/query/DQL/tree/math/twin/scene` fixtures;
- secure ZIP read;
- local + archive + web researcher pipeline;
- Biofoundry startup;
- observed temperature change → new Twin/scene URI/OpenUSD;
- capacity exceeded → no current scene overwrite;
- Proto contract scan;
- offline query-result receipts.

## Integrations delivered, requiring a host

1. **Live OpenRouter** — an API key and a selected model that supports structured outputs.
2. **todo2code checkout** — `T2C_ROOT`, `T2C_BIN`, and `make verify` in its repository.
3. **Docling** — PDF/DOCX/PPTX/scan → Markdown.
4. **ClickHouse** — insert/search/revision.
5. **Live DQL** — a public sitemap plus robots and DNS/SSRF policies.
6. **Subactor bridge** — ticket manifest, exact URI Process, AQL projection.
7. **OpenUSD tooling** — parser/usdchecker and optional glTF export.

## Production gateways required later

- AV and converter sandbox;
- object storage/CAS;
- PostgreSQL/event store;
- durable workflow + retry/DLQ;
- signed receipts;
- OpenTelemetry;
- backup/restore;
- tenancy and retention.
