# Gap to full autonomy

## Implemented

- NL → validated DSL proposals;
- runtime operation without NL after DSL materialization;
- continuous source and observation watching;
- deterministic hashes, diffs and no-change;
- todo2code adapter boundary;
- twarde mathDSL gates;
- candidate/current publication model;
- iteration receipts and feedback;
- project-level Docker and CI/CD generation.

## Still required for autonomous runtime/code improvement

1. Real `todo2code` checkout in CI and live semantic benchmark.
2. Code-change proposal → complete source patch → hash-bound approval.
3. Isolated branch/worktree/container for every code mutation.
4. Unit, integration, TestQL, security, performance and scene acceptance gates.
5. Signed AQL grant with exact paths, operations, cost and expiry.
6. Canary deployment and automatic rollback to last-known-good.
7. PostgreSQL/Kurrent event store instead of local JSON/JSONL.
8. Temporal or equivalent durable workflow engine with retry and DLQ.
9. OpenTelemetry traces across intent, query, patch, build and deployment.
10. Real CAD/BIM/OpenUSD validation for physical geometry.
11. Backup, restore, retention, malware scanning and object storage.
12. Independent evaluator which cannot be modified by the actor it evaluates.

`allowRuntimeSelfModification=false` is therefore a deliberate fail-closed default.
