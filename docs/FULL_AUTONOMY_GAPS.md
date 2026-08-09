# Gap to full autonomy

## Implemented (through 0.5.0)

- NL → validated DSL proposals;
- runtime operation without NL after DSL materialization;
- continuous source and observation watching;
- deterministic hashes, diffs and no-change;
- todo2code adapter boundary (`pipeline`, `propose-source-patch`, `apply-source-patch`);
- hard mathDSL gates (LLM cannot redefine authority);
- candidate/current publication model;
- iteration receipts, failure receipts, dead-letter and feedback;
- project-level Docker and CI/CD generation;
- **cryptographic signed mutation grants** (HMAC-HS256, ported from `subactor/runtime` apply-grant);
- **jti single-use replay store** for apply path;
- **isolated worktree / directory-copy workspace** per mutation proposal;
- **propose-only mutation pipeline** with typed receipt (`subactor.mutation-proposal-receipt/v1`);
- **gated isolated apply** (requires `autonomyMode=apply`, `allowRuntimeSelfModification`, grant consume, approval hash);
- **twin-probes autonom-cycle ingest** (`subactor.autonom-cycle/v1` → probe evidence summary).
- **post-apply re-analysis and close gate** (`todo2code pipeline` in isolation →
  `t2c.code-change-close-result/v1`; rejected or unevaluable changes cannot be promoted).

## Still required for autonomous runtime/code improvement

1. Real `todo2code` checkout in CI and live semantic benchmark (not only adapter + empty local proposal).
2. Live semantic benchmark: diagnostics → code-change-plan from real todo2code → filled unifiedDiff.
   The runtime-owned re-analysis and `close-code-change` half is implemented; a real reviewed patch
   and signed grant are still required to exercise it against the Nanobionic project.
3. Container isolation (not only git worktree / directory copy).
4. Unit, integration, TestQL, security, performance and scene acceptance gates after apply.
5. Full AQL grant profile (cost ceilings, URI process allowlists, multi-principal quorum) — current grants cover plan/artifact/target/actor/jti/expiry.
6. Canary deployment and automatic rollback to last-known-good (reuse `subactor/autonomy-lab` repair-canary / repair-promotion contracts).
7. PostgreSQL/Kurrent event store instead of local JSON/JSONL.
8. Temporal or equivalent durable workflow engine with retry and DLQ.
9. OpenTelemetry traces across intent, query, patch, build and deployment.
10. Real CAD/BIM/OpenUSD validation for physical geometry.
11. Backup, restore, retention, malware scanning and object storage.
12. Independent evaluator identity which cannot be modified by the actor it evaluates (`require_distinct_identity` from autonomy contracts).
13. Promotion from isolated workspace to main tree (currently apply stays inside isolation).

`allowRuntimeSelfModification=false` remains the deliberate fail-closed default.
