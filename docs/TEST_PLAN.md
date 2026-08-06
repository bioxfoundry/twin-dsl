# Plan testów

## Automatyczne bramy 0.2.0

- TypeScript strict;
- 8 testów Node;
- query/tree/math parsers;
- hard-gate comparisons;
- DQL sitemap, host/path/context budgets;
- OpenRouter structured-output mock;
- `NL → intent/resource/query/DQL/tree/math/twin/scene` fixtures;
- bezpieczny odczyt ZIP;
- local + archive + web researcher pipeline;
- Biofoundry startup;
- zmiana obserwowanej temperatury → nowy Twin/scene URI/OpenUSD;
- przekroczenie capacity → brak nadpisania current scene;
- Proto contract scan;
- offline query-result receipts.

## Integracje dostarczone, wymagające hosta

1. **Live OpenRouter** — klucz i wybrany model supporting structured outputs.
2. **todo2code checkout** — `T2C_ROOT`, `T2C_BIN`, `make verify` w jego repo.
3. **Docling** — PDF/DOCX/PPTX/skan → Markdown.
4. **ClickHouse** — insert/search/revision.
5. **Live DQL** — publiczna sitemap, robots i DNS/SSRF policies.
6. **Subactor bridge** — ticket manifest, exact URI Process, AQL projection.
7. **OpenUSD tooling** — parser/usdchecker i opcjonalny glTF export.

## Produkcyjne bramy wymagane później

- AV i sandbox konwerterów;
- object storage/CAS;
- PostgreSQL/event store;
- durable workflow + retry/DLQ;
- signed receipts;
- OpenTelemetry;
- backup/restore;
- tenancy i retencja.
