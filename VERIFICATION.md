# Verification report — 0.5.0

Date: 2026-08-06

## Verified path

```text
files/directories/ZIP/DQL
→ resource records and content snapshot
→ research tree/query/math
→ todo2code development graph + diagnostics + manifest
→ runtime/environment observationDSL
→ deterministic authority gates
→ twinDSL grounding
→ sceneDSL grounding/OpenUSD
→ feedback + improvementDSL
→ next iteration
```

## Executed source gates

```text
TypeScript strict:                         PASS
Protobuf contract scan:                    12 PASS
  - proto3                               PASS
  - positive field numbers               PASS
  - duplicate field-number detection     PASS
Compose contract:                          PASS
Node unit/integration tests:               17/17 PASS
NL → DSL deterministic fixtures:           11/11 PASS
OpenRouter strict structured-output mock:  PASS
DQL sitemap/context crawler:               PASS
Folder and ZIP ingestion:                  PASS
External source Docker import:             PASS
Biofoundry real-time update:               PASS
Project wizard:                            PASS
Generic living iteration:                  PASS
Todo2code process adapter:                 PASS
LLM authority override rejection:          PASS
Development fixture policy:                PASS
Rate-limit hard gate:                      PASS
Persistent project lease:                  PASS
Failure receipt/dead-letter:               PASS
ImprovementDSL proposal:                   PASS
No-change detection:                       PASS
Manager-policy publication block:          PASS
Last-known-good scene preservation:        PASS
ClickHouse service request mock:            PASS
Docling health request mock:                PASS
Root Docker Compose YAML parse:             PASS
Generated Docker Compose YAML parse:        PASS
Root GitHub Actions YAML parse:              PASS
Generated GitHub Actions YAML parse:         PASS
```

Primary command:

```bash
npm run verify
```

## Executed examples

```text
npm run demo             PASS
npm run demo:nl-dsl      PASS — 11 DSL kinds
npm run demo:research    PASS
npm run demo:biofoundry  PASS
npm run demo:realtime    PASS
npm run demo:living      PASS
npm run demo:autonomy    PASS
```

The autonomy example proved:

- a baseline approved iteration is published;
- a fixture without the required review is blocked;
- LLM-proposed changes to `ManagerApproved` and `IterationAllowed` are ignored and audited;
- a typed improvement plan is emitted;
- a simulated connector failure produces a retryable failure receipt.

## Full-loop observations

- The first changed iteration creates research, development, observation, math, Twin, Scene, feedback and improvement artifacts.
- Feedback is consumed as a derived source in the next iteration.
- An identical state returns `noChange=true` with the previous iteration URI.
- Environmental change creates a new source snapshot and Scene URI.
- Authority change blocks publication and leaves `current/scene.usda` unchanged.
- Runtime timestamps do not trigger rebuilding on their own.
- The rate limit is evaluated before Scene publication.
- A persistent filesystem lease blocks duplicate cross-process iteration.

## Docker and CI/CD status

Created and syntax/contract validated:

- root Docker Compose stack;
- generated per-project Compose stack;
- ClickHouse service;
- Docling service;
- runtime watcher service;
- health checks and service-healthy dependencies;
- isolated volumes;
- root CI, Docker integration and release workflows;
- generated-project CI and release workflows;
- `service-check` performing a real ClickHouse SQL request and Docling health request.

The current execution environment has no Docker binary or daemon. Consequently, the following were not executed locally:

```text
docker compose config -q
docker compose build
docker compose up -d --wait
real container service-check
container networking and volume persistence
```

The delivered GitHub Actions Docker workflow runs these gates on `ubuntu-latest`.

## GitHub and todo2code boundary

The GitHub connector confirmed public access to `semcod/todo2code`, but the installed app exposes read-only repository permission (`push=false`). The environment also could not resolve github.com for `git clone`. Therefore:

- no branch or pull request was pushed;
- the public DSL/protocol documentation was inspected;
- the integration was validated with a contract-compatible executable CLI fixture;
- the generated project CI bootstraps and builds canonical `semcod/todo2code` before its deterministic iteration.

## Live external boundaries not executed

- paid OpenRouter request;
- full current `semcod/todo2code` checkout with filled unifiedDiff patches;
- live internet crawl;
- live ClickHouse and Docling containers;
- external OpenUSD/CAD/BIM validator;
- promotion from isolated workspace to the live development tree;
- canary / automatic rollback (contracts exist in `subactor/autonomy-lab`, not wired end-to-end here).

## 0.5.0 mutation control plane (verified offline)

- cryptographic mutation grant issue/verify (HMAC-HS256);
- jti single-use consume on apply path;
- isolated workspace (git toplevel worktree or directory copy for nested/non-git roots);
- propose-only mutation pipeline + typed receipt;
- twin-probes autonom-cycle validation and evidence summary;
- `npm run demo:mutation` PASS.

## Autonomy conclusion

The package validates autonomous Twin model/scene iteration inside approved `projectDSL`, with immutable runtime-owned gates, development evidence, failure handling and propose-only self-improvement plans.

0.5.0 adds a fail-closed code-mutation control plane (signed grant → isolate → propose; optional isolated apply). It does **not** promote patches to the live tree or run canary/rollback. Remaining path:

```text
todo2code diagnostic
→ code-change plan (real t2c)
→ source patch with unifiedDiff
→ signed grant
→ isolated apply
→ tests
→ re-analysis / close-code-change
→ independent acceptance
→ canary (autonomy-lab)
→ rollback or promotion
```
