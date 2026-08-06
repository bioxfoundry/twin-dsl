# Verification report — 0.3.0

Date: 2026-08-06

## Verified path

```text
files/directories/ZIP/DQL
→ resource records and content snapshot
→ research tree/query/math
→ todo2code development evidence boundary
→ runtime/environment observationDSL
→ hard iteration gates
→ twinDSL
→ sceneDSL/OpenUSD
→ feedback source
→ next iteration
```

## Executed gates

```text
TypeScript strict:                         PASS
Protobuf contract scan:                    10 PASS
Compose contract:                          PASS
Node unit/integration tests:               11/11 PASS
NL → DSL deterministic fixtures:           10/10 PASS
OpenRouter strict structured-output mock:  PASS
DQL sitemap/context crawler:               PASS
Folder and ZIP ingestion:                  PASS
Biofoundry real-time update:               PASS
Project wizard:                            PASS
Generic living iteration:                  PASS
Todo2code process adapter:                 PASS
No-change detection:                       PASS
Manager-policy publication block:          PASS
Last-known-good scene preservation:        PASS
Root Docker Compose YAML parse:             PASS
Generated Docker Compose YAML parse:        PASS
Root GitHub Actions YAML parse:              PASS
Generated GitHub Actions YAML parse:         PASS
```

Primary command:

```bash
npm run verify
```

## Full-loop observations

- First iteration creates research, development, observation, math, twin, scene and feedback artifacts.
- The feedback file is deliberately consumed on the second iteration.
- The third identical iteration returns `noChange=true` with the previous iteration URI.
- Changing environmental data creates a new source snapshot and Scene URI.
- Changing projectDSL authority (`approved=false`) blocks publication and leaves `current/scene.usda` unchanged.
- Runtime timestamps do not trigger rebuilding on their own.

## Docker and CI/CD status

Created and syntax-validated:

- root Docker Compose stack;
- generated per-project Compose stack;
- ClickHouse service;
- Docling service;
- TypeScript runtime watcher service;
- health checks and isolated volumes;
- starter CI workflow;
- generated-project CI workflow;
- GHCR release workflows.

The current execution environment has no Docker binary or daemon. Consequently, `docker compose up`, image build, container health and network integration were not executed here. Delivered GitHub Actions run these gates on `ubuntu-latest`.

## Live external boundaries

Not executed in this environment:

- paid OpenRouter request;
- full current `semcod/todo2code` checkout and its complete pipeline;
- live internet crawl;
- live ClickHouse and Docling containers;
- external OpenUSD/CAD/BIM validator.

Tested instead:

- controlled OpenRouter HTTP mock with strict JSON Schema;
- contract-compatible todo2code fixture;
- executable fake todo2code CLI producing canonical `latest → manifest → graph` artifacts;
- sitemap and HTML fixtures through the same crawler;
- in-memory search projection;
- deterministic OpenUSD ASCII output.

## Autonomy conclusion

The package validates autonomous **Twin model/scene iteration inside an approved projectDSL**. It does not validate unrestricted autonomous mutation of its own runtime source. That requires signed AQL/OQL authority, isolated source patches, independent acceptance, canary deployment and rollback.
